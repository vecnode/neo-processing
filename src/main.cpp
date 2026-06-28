#include <httplib.h>
#include <cpp-embedlib-httplib.h>
#include "WebAssets.h"
#include "webview/webview.h"

#include <boost/asio.hpp>

#include <cctype>
#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>

#ifdef __linux__
#include <gtk/gtk.h>
#include <limits.h>
#include <unistd.h>
#endif

#ifdef _WIN32
#include <windows.h>
#endif

#ifdef _WIN32
std::filesystem::path get_executable_dir() {
  wchar_t path[MAX_PATH]{};
  auto len = GetModuleFileNameW(nullptr, path, MAX_PATH);
  if (len == 0 || len >= MAX_PATH) {
    return std::filesystem::current_path();
  }
  return std::filesystem::path(path).parent_path();
}

void apply_windows_icons(webview::webview &w) {
  auto window_result = w.window();
  if (!window_result.ok()) {
    return;
  }

  auto hwnd = static_cast<HWND>(window_result.value());
  if (!hwnd) {
    return;
  }

  const auto icon_dir = get_executable_dir() / "icons";
  const auto small_icon_path = (icon_dir / "app_icon_small.ico").wstring();
  const auto large_icon_path = (icon_dir / "app_icon.ico").wstring();

  auto small_icon = static_cast<HICON>(LoadImageW(
      nullptr, small_icon_path.c_str(), IMAGE_ICON,
      GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON),
      LR_LOADFROMFILE));

  auto large_icon = static_cast<HICON>(LoadImageW(
      nullptr, large_icon_path.c_str(), IMAGE_ICON,
      GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON),
      LR_LOADFROMFILE));

  if (small_icon) {
    SendMessageW(hwnd, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(small_icon));
    SetClassLongPtrW(hwnd, GCLP_HICONSM, reinterpret_cast<LONG_PTR>(small_icon));
  }

  if (large_icon) {
    SendMessageW(hwnd, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(large_icon));
    SetClassLongPtrW(hwnd, GCLP_HICON, reinterpret_cast<LONG_PTR>(large_icon));
  }
}
#endif

#ifdef __linux__
std::filesystem::path get_executable_dir() {
  char path[PATH_MAX]{};
  auto len = readlink("/proc/self/exe", path, sizeof(path) - 1);
  if (len <= 0) {
    return std::filesystem::current_path();
  }

  path[len] = '\0';
  return std::filesystem::path(path).parent_path();
}

void apply_linux_icon(webview::webview &w) {
  auto window_result = w.window();
  if (!window_result.ok()) {
    return;
  }

  auto gtk_window = GTK_WINDOW(window_result.value());
  if (!gtk_window) {
    return;
  }

  const auto exe_dir = get_executable_dir();
  const std::filesystem::path candidates[] = {
      exe_dir / "icons" / "app_icon.ico",
      exe_dir / "icons" / "app_icon_small.ico",
      std::filesystem::current_path() / "icons" / "app_icon.ico",
      std::filesystem::current_path() / "icons" / "app_icon_small.ico"};

  for (const auto &icon_path : candidates) {
    if (!std::filesystem::exists(icon_path)) {
      continue;
    }

    GError *error = nullptr;
    if (gtk_window_set_icon_from_file(
            gtk_window, icon_path.string().c_str(), &error)) {
      if (error) {
        g_error_free(error);
      }
      return;
    }

    if (error) {
      g_error_free(error);
    }
  }
}
#endif

// Largest script body accepted by /api/save-script. The HTTP server's global
// payload cap is set higher (to allow media uploads), so each handler enforces
// its own tighter limit as a second line of defence.
constexpr size_t kMaxScriptBytes = 5 * 1024 * 1024; // 5 MiB

// Largest media blob accepted by /api/save-media (PNG capture / WebM recording).
// The body is buffered in memory by both the client and the server before being
// written, so this also bounds peak memory use per request.
constexpr size_t kMaxMediaBytes = 256 * 1024 * 1024; // 256 MiB

// Local timestamp used to name output files. With `with_millis` the value gains
// a millisecond suffix, which keeps rapid captures/recordings from colliding.
std::string current_timestamp(bool with_millis) {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);

  std::tm local_time{};
#ifdef _WIN32
  localtime_s(&local_time, &time);
#else
  localtime_r(&time, &local_time);
#endif

  std::ostringstream stream;
  stream << std::put_time(&local_time, "%Y-%m-%d-%H-%M-%S");
  if (with_millis) {
    const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                        now.time_since_epoch()) %
                    1000;
    stream << '-' << std::setfill('0') << std::setw(3) << ms.count();
  }
  return stream.str();
}

std::filesystem::path outputs_dir() {
  const auto dir = std::filesystem::current_path() / "outputs";
  std::filesystem::create_directories(dir);
  return dir;
}

void write_file(const std::filesystem::path &path, const std::string &contents) {
  std::ofstream stream(path, std::ios::binary);
  stream << contents;
  if (!stream) {
    throw std::runtime_error("Failed to write file");
  }
}

std::filesystem::path save_script_to_outputs(const std::string &contents) {
  const auto path = outputs_dir() / (current_timestamp(false) + "_p5.js");
  write_file(path, contents);
  return path;
}

// Returns a lower-cased, alphanumeric-only extension, or "" if `raw` contains
// anything else. This guarantees the client-supplied extension can never
// introduce a path separator or traversal sequence.
std::string sanitize_extension(const std::string &raw) {
  std::string ext;
  for (unsigned char c : raw) {
    if (!std::isalnum(c)) {
      return {};
    }
    ext += static_cast<char>(std::tolower(c));
  }
  return ext;
}

bool is_allowed_media_extension(const std::string &ext) {
  return ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webm" ||
         ext == "mp4";
}

std::filesystem::path save_media_to_outputs(const std::string &contents,
                                            const std::string &label,
                                            const std::string &ext) {
  const auto path =
      outputs_dir() / (current_timestamp(true) + "_" + label + "." + ext);
  write_file(path, contents);
  return path;
}

int main() {
  // Boost.Asio io_context — reserved as the foundation for future async work
  // (timers, networking, background jobs). The work guard keeps it alive even
  // while idle so handlers can be posted to it without the run loop exiting.
  boost::asio::io_context ioc;
  auto work_guard = boost::asio::make_work_guard(ioc);

  // Run the io_context on a dedicated thread so it never blocks the UI thread.
  std::thread asio_thread([&ioc]() { ioc.run(); });

  httplib::Server server;

  // Cap request bodies at the transport layer and bound how long a single
  // request may hold a worker, so a slow or oversized client cannot stall the
  // local server. The global cap accommodates media uploads; each handler
  // enforces its own tighter, type-specific limit below.
  server.set_payload_max_length(kMaxMediaBytes);
  server.set_read_timeout(60, 0);  // 60 s (recordings can be sizable)
  server.set_write_timeout(30, 0); // 30 s

  server.Get("/health", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("ok", "text/plain; charset=utf-8");
  });

  server.Post("/api/save-script", [](const httplib::Request &req, httplib::Response &res) {
    if (req.body.empty()) {
      res.status = 400;
      res.set_content("Editor is empty", "text/plain; charset=utf-8");
      return;
    }

    if (req.body.size() > kMaxScriptBytes) {
      res.status = 413;
      res.set_content("Script too large", "text/plain; charset=utf-8");
      return;
    }

    try {
      const auto saved_path = save_script_to_outputs(req.body);
      res.set_content(saved_path.filename().string(), "text/plain; charset=utf-8");
    } catch (const std::exception &ex) {
      std::cerr << "[save-script] " << ex.what() << std::endl;
      res.status = 500;
      res.set_content("Failed to save script", "text/plain; charset=utf-8");
    }
  });

  // Save a captured frame (PNG) or recording (WebM) to outputs/. The binary
  // body is written verbatim; the filename is generated server-side and the
  // extension is validated against an allow-list, so the client never controls
  // a path on disk.
  server.Post("/api/save-media", [](const httplib::Request &req, httplib::Response &res) {
    const auto ext = sanitize_extension(req.get_param_value("ext"));
    if (!is_allowed_media_extension(ext)) {
      res.status = 400;
      res.set_content("Unsupported media type", "text/plain; charset=utf-8");
      return;
    }

    if (req.body.empty()) {
      res.status = 400;
      res.set_content("Empty body", "text/plain; charset=utf-8");
      return;
    }

    if (req.body.size() > kMaxMediaBytes) {
      res.status = 413;
      res.set_content("Media too large", "text/plain; charset=utf-8");
      return;
    }

    const bool is_video = (ext == "webm" || ext == "mp4");
    try {
      const auto saved_path = save_media_to_outputs(
          req.body, is_video ? "recording" : "capture", ext);
      res.set_content(saved_path.filename().string(), "text/plain; charset=utf-8");
    } catch (const std::exception &ex) {
      std::cerr << "[save-media] " << ex.what() << std::endl;
      res.status = 500;
      res.set_content("Failed to save media", "text/plain; charset=utf-8");
    }
  });

  // Serve embedded static assets from public/.
  httplib::mount(server, Web::FS);

  // Bind to loopback only — the server must never be reachable off-host.
  auto port = server.bind_to_any_port("127.0.0.1");
  if (port <= 0) {
    std::cerr << "Failed to bind HTTP server" << std::endl;
    work_guard.reset();
    ioc.stop();
    asio_thread.join();
    return 1;
  }

  std::thread server_thread([&]() { server.listen_after_bind(); });

  webview::webview w(false, nullptr);
  w.set_title("neo-processing v0.1.0");
  w.set_size(1280, 720, WEBVIEW_HINT_NONE);
#ifdef _WIN32
  apply_windows_icons(w);
#endif
#ifdef __linux__
  apply_linux_icon(w);
#endif
  w.navigate("http://127.0.0.1:" + std::to_string(port));
  w.run();

  server.stop();
  server_thread.join();

  // Shut down Asio cleanly: release the work guard so run() can drain, then
  // stop the context and join its thread.
  work_guard.reset();
  ioc.stop();
  asio_thread.join();

  return 0;
}
