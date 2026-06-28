#include <httplib.h>
#include <cpp-embedlib-httplib.h>
#include "WebAssets.h"
#include "webview/webview.h"

#include <boost/asio.hpp>

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

// Largest script body accepted by /api/save-script. The HTTP server enforces
// the same limit at the transport layer; this constant is the second line of
// defence inside the handler.
constexpr size_t kMaxScriptBytes = 5 * 1024 * 1024; // 5 MiB

std::string build_output_filename() {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);

  std::tm local_time{};
#ifdef _WIN32
  localtime_s(&local_time, &time);
#else
  localtime_r(&time, &local_time);
#endif

  std::ostringstream stream;
  stream << std::put_time(&local_time, "%Y-%m-%d-%H-%M-%S") << "_p5.js";
  return stream.str();
}

std::filesystem::path save_script_to_outputs(const std::string &contents) {
  const auto output_dir = std::filesystem::current_path() / "outputs";
  std::filesystem::create_directories(output_dir);

  const auto output_path = output_dir / build_output_filename();
  std::ofstream stream(output_path, std::ios::binary);
  stream << contents;

  if (!stream) {
    throw std::runtime_error("Failed to write script file");
  }

  return output_path;
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
  // request may hold a worker, so a slow or oversized client cannot stall
  // the local server.
  server.set_payload_max_length(kMaxScriptBytes);
  server.set_read_timeout(10, 0);  // 10 s
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
  w.set_title("neo-processing");
  w.set_size(900, 640, WEBVIEW_HINT_NONE);
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
