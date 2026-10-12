// Skill Studio 桌面外壳：启动本地服务，并用系统自带的 WebView2 显示界面。
// 这样双击 exe 打开的是应用自己的窗口，而不是浏览器标签页。
#![cfg_attr(all(target_os = "windows", not(test)), windows_subsystem = "windows")]

use std::{
    ffi::c_void,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command},
    thread,
    time::{Duration, Instant},
};

use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{Icon, WindowBuilder},
};
use wry::{WebContext, WebViewBuilder};

const APP_TITLE: &str = "Skill Studio";
const SERVICE_EXE: &str = "SkillStudio.exe";
const STUDIO_MARKER: &str = "\"app\":\"skill-studio\"";
const DEFAULT_PORT: u16 = 4173;
const PORT_ATTEMPTS: u16 = 12;
const READY_TIMEOUT: Duration = Duration::from_secs(30);

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MB_ICONERROR: u32 = 0x0000_0010;

#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn MessageBoxW(hwnd: *mut c_void, text: *const u16, caption: *const u16, utype: u32) -> i32;
}

fn show_error(message: &str) {
    #[cfg(target_os = "windows")]
    unsafe {
        let text: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
        let caption: Vec<u16> = APP_TITLE.encode_utf16().chain(std::iter::once(0)).collect();
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), MB_ICONERROR);
    }
    #[cfg(not(target_os = "windows"))]
    eprintln!("{message}");
}

fn app_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn service_candidates(root: &Path) -> Vec<PathBuf> {
    // 只认 service 子目录，避免在外壳所在目录里误把外壳自己当成服务。
    vec![root.join("service").join(SERVICE_EXE)]
}

fn candidate_ports(start: u16, attempts: u16) -> Vec<u16> {
    (0..attempts).map(|offset| start + offset).collect()
}

fn free_port(start: u16, attempts: u16) -> Option<u16> {
    candidate_ports(start, attempts)
        .into_iter()
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

fn studio_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/")
}

fn http_get(port: u16, path: &str) -> Option<String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(800)).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(2000))).ok()?;
    stream.set_write_timeout(Some(Duration::from_millis(2000))).ok()?;

    let request = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).ok()?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    Some(response)
}

fn is_studio_response(response: &str) -> bool {
    let status_ok = response
        .lines()
        .next()
        .map(|line| line.contains(" 200 "))
        .unwrap_or(false);

    status_ok && response.contains(STUDIO_MARKER)
}

fn probe_studio(port: u16) -> bool {
    http_get(port, "/api/studio-info")
        .map(|response| is_studio_response(&response))
        .unwrap_or(false)
}

fn find_running_studio() -> Option<u16> {
    candidate_ports(DEFAULT_PORT, PORT_ATTEMPTS)
        .into_iter()
        .find(|port| probe_studio(*port))
}

fn spawn_service(service: &Path, port: u16, data_dir: &Path) -> std::io::Result<Child> {
    let mut command = Command::new(service);
    command
        .env("SKILL_STUDIO_NO_OPEN", "1")
        .env("SKILL_STUDIO_PORT", port.to_string())
        .env("SKILL_STUDIO_DATA_DIR", data_dir);

    if let Some(directory) = service.parent() {
        command.current_dir(directory);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn()
}

fn wait_until_ready(port: u16) -> bool {
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if probe_studio(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

/// 读取打包进来的 logo 资源，返回 RGBA 像素。
fn decode_logo(bytes: &[u8]) -> (Vec<u8>, u32, u32) {
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
        .read_info()
        .expect("logo 读取失败");
    let mut buffer = vec![0u8; reader.output_buffer_size().expect("logo 尺寸未知")];
    let info = reader.next_frame(&mut buffer).expect("logo 解码失败");
    assert_eq!(info.color_type, png::ColorType::Rgba, "logo 必须是带透明通道的 PNG");
    buffer.truncate(info.buffer_size());
    (buffer, info.width, info.height)
}

/// 应用图标来自生成好的 logo（见 build/desktop/assets，可由 prepare-logo.ps1 重新生成）。
fn app_icon() -> Icon {
    let (rgba, width, height) = decode_logo(include_bytes!("../assets/logo.png"));
    Icon::from_rgba(rgba, width, height).expect("图标数据应当有效")
}

/// 退出时确保本地服务一起结束，避免留下后台进程。
struct ServiceGuard(Option<Child>);

impl ServiceGuard {
    fn stop(&mut self) {
        if let Some(mut child) = self.0.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for ServiceGuard {
    fn drop(&mut self) {
        self.stop();
    }
}

fn main() {
    let root = app_root();
    let data_dir = root.join("data");
    let _ = std::fs::create_dir_all(&data_dir);

    let (url, guard) = match find_running_studio() {
        // 已经有实例在运行时直接复用，不重复启动服务。
        Some(port) => (studio_url(port), ServiceGuard(None)),
        None => {
            let service = service_candidates(&root).into_iter().find(|path| path.is_file());
            let Some(service) = service else {
                show_error("没有找到本地服务文件：service\\SkillStudio.exe\n\n请保持目录完整后再试。");
                return;
            };

            let Some(port) = free_port(DEFAULT_PORT, PORT_ATTEMPTS) else {
                show_error("找不到可用端口，请关闭占用 4173 附近端口的程序后重试。");
                return;
            };

            match spawn_service(&service, port, &data_dir) {
                Ok(child) => {
                    if wait_until_ready(port) {
                        (studio_url(port), ServiceGuard(Some(child)))
                    } else {
                        drop(child);
                        show_error("本地服务启动超时，请稍后重试。");
                        return;
                    }
                }
                Err(error) => {
                    show_error(&format!("无法启动本地服务：{error}"));
                    return;
                }
            }
        }
    };

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title(APP_TITLE)
        .with_window_icon(Some(app_icon()))
        .with_inner_size(LogicalSize::new(1480.0, 940.0))
        .with_min_inner_size(LogicalSize::new(1080.0, 680.0))
        .build(&event_loop)
        .expect("窗口创建失败");

    // WebView2 的缓存放到 data 目录，保持应用目录整洁。
    let mut web_context = WebContext::new(Some(data_dir.join("webview2")));

    let _webview = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_url(url)
        .build(&window)
        .expect("界面加载失败");

    let mut guard = guard;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Event::WindowEvent { event: WindowEvent::CloseRequested, window_id, .. } = event {
            if window_id == window.id() {
                // tao 的 Exit 在 Wait 状态下不会立刻跳出消息循环，这里显式退出，
                // 保证关窗口时后台服务一定被回收、进程一定结束。
                guard.stop();
                std::process::exit(0);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_expected_port_range() {
        assert_eq!(candidate_ports(4173, 3), vec![4173, 4174, 4175]);
    }

    #[test]
    fn accepts_only_our_studio_response() {
        let ok = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"app\":\"skill-studio\",\"stateFile\":\"data\\\\state.json\"}";
        let other_app = "HTTP/1.1 200 OK\r\n\r\n{\"app\":\"something-else\"}";
        let not_found = "HTTP/1.1 404 Not Found\r\n\r\n{\"error\":\"API 路径不存在\"}";

        assert!(is_studio_response(ok));
        assert!(!is_studio_response(other_app));
        assert!(!is_studio_response(not_found));
    }

    #[test]
    fn skips_ports_that_are_already_in_use() {
        let busy = TcpListener::bind(("127.0.0.1", 0)).expect("需要能绑定临时端口");
        let busy_port = busy.local_addr().expect("需要本地地址").port();
        if busy_port >= u16::MAX - 2 {
            return;
        }

        let picked = free_port(busy_port, 3).expect("应当找到一个空闲端口");
        assert_ne!(picked, busy_port);
        assert!(picked > busy_port);
    }

    #[test]
    fn decodes_the_bundled_logo_with_transparency() {
        let (rgba, width, height) = decode_logo(include_bytes!("../assets/logo.png"));
        assert_eq!((width, height), (200, 200));
        assert_eq!(rgba.len(), (width * height * 4) as usize);

        // 圆角之外是透明背景。
        assert_eq!(rgba[3], 0);
        let last_alpha = rgba[(width * height * 4 - 1) as usize];
        assert_eq!(last_alpha, 0);

        // 徽章中心是不透明的。
        let center_alpha = ((100 * width + 100) * 4 + 3) as usize;
        assert_eq!(rgba[center_alpha], 255);
    }

    #[test]
    fn builds_a_window_icon_from_the_logo() {
        let (rgba, width, height) = decode_logo(include_bytes!("../assets/logo.png"));
        assert!(Icon::from_rgba(rgba, width, height).is_ok());
    }
}
