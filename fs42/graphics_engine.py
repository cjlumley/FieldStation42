"""Persistent graphics window for live, schedule-aware bumpers (e.g. Snow Day).

Launching a fresh QtWebEngine window per bumper (how autobump web pages normally play) costs
3-4 seconds of black screen on a Raspberry Pi 5. Instead this keeps one window alive with the
engine page loaded, hidden until a cue arrives. A cue updates the page with JavaScript and shows
the window over mpv within ~0.1 s; hide() drops back to the video underneath.

The page must expose window.fs42Graphics.cue(obj) and window.fs42Graphics.stop().
"""
import json
import logging
import multiprocessing
import queue as queue_mod

POLL_MS = 15


def graphics_engine_runner(page_url, command_queue):
    import signal
    from PySide6.QtCore import QUrl, QTimer, Qt
    from PySide6.QtWidgets import QApplication
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebEngineCore import QWebEngineSettings
    from fs42.webrender.web_render import ApiKeyInterceptor
    from fs42.station_manager import StationManager

    signal.signal(signal.SIGINT, signal.SIG_DFL)
    app = QApplication([])
    view = QWebEngineView()
    settings = view.settings()
    settings.setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
    view.page().profile().setHttpUserAgent("FieldStation42-Graphics/1.0")
    view.page().setBackgroundColor(Qt.black)
    view.setCursor(Qt.BlankCursor)
    view.setWindowTitle("FieldStation42 Graphics")

    api_key = StationManager().api_key()
    interceptor = None
    if api_key:
        port = int(StationManager().server_conf.get("server_port", 4242))
        interceptor = ApiKeyInterceptor(api_key, port)
        view.page().profile().setUrlRequestInterceptor(interceptor)

    view.setUrl(QUrl(page_url))

    def poll():
        while True:
            try:
                msg = command_queue.get_nowait()
            except queue_mod.Empty:
                return
            cmd = msg.get("cmd")
            if cmd == "show":
                # update the page first, then show: the new graphic is on screen immediately
                view.page().runJavaScript(f"window.fs42Graphics && window.fs42Graphics.cue({json.dumps(msg.get('cue', {}))})")
                view.showFullScreen()
                view.raise_()
                # the page measured a hidden window; re-fit once it's full screen (resize events also do this)
                for delay in (60, 250):
                    QTimer.singleShot(delay, lambda: view.page().runJavaScript(
                        "window.fs42Graphics && window.fs42Graphics.refit && window.fs42Graphics.refit()"))
            elif cmd == "hide":
                view.hide()
                view.page().runJavaScript("window.fs42Graphics && window.fs42Graphics.stop()")
            elif cmd == "quit":
                app.quit()
                return

    timer = QTimer()
    timer.timeout.connect(poll)
    timer.start(POLL_MS)
    # pre-warm: map the window once so the first real cue shows instantly
    view.showFullScreen()
    QTimer.singleShot(1500, view.hide)
    app.exec()


class GraphicsEngine:
    def __init__(self, page_url):
        self._l = logging.getLogger("Graphics")
        self.page_url = page_url
        self.visible = False
        ctx = multiprocessing.get_context("spawn")
        self.queue = ctx.Queue()
        self.process = ctx.Process(target=graphics_engine_runner, args=(page_url, self.queue), daemon=True)
        self.process.start()
        self._l.info(f"Started graphics engine for {page_url}")

    def alive(self):
        return self.process is not None and self.process.is_alive()

    def show(self, cue):
        self.queue.put({"cmd": "show", "cue": cue})
        self.visible = True

    def hide(self):
        if self.visible:
            self.queue.put({"cmd": "hide"})
            self.visible = False

    def stop(self):
        try:
            self.queue.put({"cmd": "quit"})
            self.process.join(timeout=3)
            if self.process.is_alive():
                self.process.terminate()
        except Exception as e:
            self._l.warning(f"Error stopping graphics engine: {e}")
