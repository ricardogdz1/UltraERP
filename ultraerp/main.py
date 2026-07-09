"""Ponto de entrada do UltraERP.

Cria a janela desktop usando o WebView nativo do sistema operacional
(WebView2 no Windows, WebKitGTK no Linux, WKWebView no macOS).
"""

from __future__ import annotations

import webview

from ultraerp.api.bridge import ApiBridge
from ultraerp.config import UI_DIR, settings


def main() -> None:
    bridge = ApiBridge()
    window = webview.create_window(
        title="UltraERP",
        url=str(UI_DIR / "index.html"),
        js_api=bridge,
        width=1280,
        height=800,
        min_size=(1024, 640),
    )
    bridge.attach(window)
    webview.start(debug=settings.debug)


if __name__ == "__main__":
    main()
