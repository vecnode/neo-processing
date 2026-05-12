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

// Schedules a recurring Boost.Asio steady_timer that fires every `interval`.
// Automatically reschedules itself until the io_context is stopped.
void schedule_heartbeat(boost::asio::steady_timer &timer,
                        std::chrono::seconds interval) {
  timer.expires_after(interval);
  timer.async_wait([&timer, interval](const boost::system::error_code &ec) {
    if (ec) return; // cancelled or destroyed
    std::cout << "[asio] heartbeat" << std::endl;
    schedule_heartbeat(timer, interval);
  });
}

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
  // Boost.Asio io_context — owns all async operations.
  boost::asio::io_context ioc;

  // Keep the io_context alive even when no async work is pending.
  auto work_guard = boost::asio::make_work_guard(ioc);

  // Periodic timer: fires every 5 seconds and logs a heartbeat.
  boost::asio::steady_timer heartbeat_timer{ioc};
  schedule_heartbeat(heartbeat_timer, std::chrono::seconds{5});

  // Run the io_context on a dedicated thread so it never blocks the UI thread.
  std::thread asio_thread([&ioc]() { ioc.run(); });

  httplib::Server server;

  server.Get("/health", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("ok", "text/plain");
  });

  server.Get("/api/hello", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("hello world", "text/plain");
  });

  server.Post("/api/save-script", [](const httplib::Request &req, httplib::Response &res) {
    if (req.body.empty()) {
      res.status = 400;
      res.set_content("Editor is empty", "text/plain");
      return;
    }

    try {
      const auto saved_path = save_script_to_outputs(req.body);
      res.set_content(saved_path.filename().string(), "text/plain");
    } catch (const std::exception &ex) {
      res.status = 500;
      res.set_content(ex.what(), "text/plain");
    }
  });

  // Serve embedded static assets from public/.
  httplib::mount(server, Web::FS);

  auto port = server.bind_to_any_port("127.0.0.1");
  if (port <= 0) {
    std::cerr << "Failed to bind HTTP server" << std::endl;
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

  // Shut down Asio cleanly.
  work_guard.reset();
  heartbeat_timer.cancel();
  ioc.stop();
  asio_thread.join();

  return 0;
}
