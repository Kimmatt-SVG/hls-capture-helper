import Foundation
import Capacitor
import WebKit
import UIKit
import AVFoundation
import AVKit
import AudioToolbox
#if !targetEnvironment(simulator)
import AMSMB2
#endif

private let minimumVideoBytes: Int64 = 1024 * 1024
private let desktopUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
private let siteOrigin = "https://www4.tornadomovies.co"

private func isAllowedLoginURL(_ url: URL?, isMainFrame: Bool) -> Bool {
    guard let url else { return false }
    let scheme = url.scheme?.lowercased() ?? ""
    if scheme == "about" || scheme == "blob" || scheme == "data" || scheme.isEmpty {
        return true
    }
    let host = url.host?.lowercased() ?? ""
    if host.contains("tornadomovies") { return true }
    if isMainFrame { return false }
    return host == "google.com"
        || host.hasSuffix(".google.com")
        || host == "gstatic.com"
        || host.hasSuffix(".gstatic.com")
        || host.contains("recaptcha")
        || host.contains("googleapis.com")
        || host.contains("googleusercontent.com")
}

private let loginPageHelperScript = """
(function() {
  if (window.__cinaripLoginHelper) return;
  window.__cinaripLoginHelper = true;
  var nativeOpen = window.open;
  window.open = function(url) {
    var href = String(url || "");
    if (/google|recaptcha|gstatic\\.com|tornadomovies/i.test(href)) {
      return nativeOpen.apply(this, arguments);
    }
    return null;
  };
  function modalForm() {
    return document.querySelector('#modal_block form#login-form')
      || document.querySelector('form[action="/user/login"]')
      || (document.querySelector('input[name="SignupForm[email]"]')
        && document.querySelector('input[name="SignupForm[email]"]').form)
      || null;
  }
  function recaptchaToken() {
    try {
      if (typeof grecaptcha !== "undefined" && typeof grecaptcha.getResponse === "function") {
        return grecaptcha.getResponse() || "";
      }
    } catch (e) {}
    return "";
  }
  function notify(msg) {
    if (window.jQuery && jQuery.notify) {
      jQuery.notify(msg, {
        type: "danger",
        animate: { enter: "animated bounceIn", exit: "animated bounceOut" }
      });
    }
  }
  function patchLoginSubmit() {
    if (!window.User || typeof User.loginSubmit !== "function" || window.__cinaripLoginSubmitPatched) return;
    window.__cinaripLoginSubmitPatched = true;
    if (window.Site) Site.resizeCaptcha = function() {};
    function parseLoginJson(text) {
      if (!text) return null;
      try { return JSON.parse(text); } catch (e) {}
      var start = text.indexOf("{");
      var end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
      }
      return null;
    }
    User.loginSubmit = function(button, flag) {
      var form = modalForm();
      if (!form || !window.jQuery) {
        notify("Login form is not ready yet.");
        return false;
      }
      var token = recaptchaToken();
      if (!token) {
        notify("Check I’m not a robot first, then tap LOGIN.");
        return false;
      }
      var $btn = jQuery(button);
      $btn.addClass("loadButton").attr("disabled", true);
      function finish() {
        $btn.removeClass("loadButton").attr("disabled", false);
      }
      function handleData(data) {
        if (!data || data.response === false) {
          notify((data && (data.msg || data.error)) || "Login failed.");
          try { grecaptcha.reset(); } catch (e) {}
          finish();
          return;
        }
        if (data.html) jQuery("div.auth").html(data.html);
        jQuery("#modal_block").modal("hide");
        finish();
      }
      var payload = jQuery(form).serialize();
      payload += "&SignupForm[reCaptcha]=" + encodeURIComponent(token);
      payload += "&notification=" + ("Notification" in window && Notification.permission === "granted");
      var csrfParam = jQuery("meta[name='csrf-param']").attr("content");
      var csrfToken = jQuery("meta[name='csrf-token']").attr("content");
      if (csrfParam && csrfToken) payload += "&" + encodeURIComponent(csrfParam) + "=" + encodeURIComponent(csrfToken);
      jQuery.ajax({
        url: "/user/login",
        type: "POST",
        data: payload,
        dataType: "text",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
        success: function(text) {
          var data = parseLoginJson(text);
          if (!data) {
            notify("Tornado did not accept this login. Complete the captcha again.");
            finish();
            return;
          }
          handleData(data);
        },
        error: function(xhr) {
          var data = parseLoginJson(xhr && xhr.responseText);
          if (data) {
            handleData(data);
            return;
          }
          var status = xhr && xhr.status ? String(xhr.status) : "network";
          notify("Login failed (" + status + "). Complete the captcha and try again.");
          finish();
        }
      });
      return false;
    };
  }
  function openLoginModal() {
    if (modalForm()) return;
    if (!window.User || typeof User.showLogin !== "function") return;
    if (window.__cinaripLoginOpening) return;
    window.__cinaripLoginOpening = true;
    User.showLogin();
    setTimeout(function() { window.__cinaripLoginOpening = false; }, 2500);
  }
  patchLoginSubmit();
  setInterval(function() {
    patchLoginSubmit();
    openLoginModal();
  }, 400);
})();
"""

private let networkHookScript = """
(function() {
  if (window.__tornadoNetHook) return;
  window.__tornadoNetHook = true;
  window.__tornadoCollectedLinks = window.__tornadoCollectedLinks || new Set();
  function add(value) {
    var text = String(value || "");
    var matches = text.match(/https?:\\/\\/[^\\s"'<>]*loadshare\\.org\\/download\\/[^\\s"'<>]+/gi);
    if (!matches) return;
    for (var i = 0; i < matches.length; i++) {
      window.__tornadoCollectedLinks.add(matches[i].replace(/[)",']+$/g, ""));
    }
  }
  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__tornadoUrl = url;
    add(url);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener("load", function() {
      add(this.responseURL);
      try { add(this.responseText); } catch (e) {}
    });
    return send.apply(this, arguments);
  };
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    add(typeof input === "string" ? input : (input && input.url));
    return origFetch.apply(this, arguments).then(function(response) {
      add(response.url);
      response.clone().text().then(add).catch(function() {});
      return response;
    });
  };
})();
"""

private let chromeCompatScript = """
(function() {
  try { Object.defineProperty(navigator, "webdriver", { get: function() { return undefined; }, configurable: true }); } catch (e) {}
  if (!window.chrome) window.chrome = { runtime: {} };
  try { window.open = function() { return null; }; } catch (e) {}
})();
"""

private final class ScrapeNavigationDelegate: NSObject, WKNavigationDelegate {
    private let shouldReady: (WKWebView) -> Bool
    private let onReady: () -> Void
    private let onProcessTerminated: () -> Void
    private let onDownloadLink: (String) -> Void
    private let onLoadFailed: (NSError) -> Void
    private var finished = false

    init(
        shouldReady: @escaping (WKWebView) -> Bool,
        onReady: @escaping () -> Void,
        onProcessTerminated: @escaping () -> Void,
        onDownloadLink: @escaping (String) -> Void = { _ in },
        onLoadFailed: @escaping (NSError) -> Void = { _ in }
    ) {
        self.shouldReady = shouldReady
        self.onReady = onReady
        self.onProcessTerminated = onProcessTerminated
        self.onDownloadLink = onDownloadLink
        self.onLoadFailed = onLoadFailed
    }

    func forceReady() {
        signalReady()
    }

    private func signalReady() {
        guard !finished else { return }
        finished = true
        onReady()
    }

    private func captureIfDownload(_ url: URL?) -> Bool {
        guard let text = url?.absoluteString,
              text.range(of: "loadshare.org/download/", options: .caseInsensitive) != nil else {
            return false
        }
        onDownloadLink(text)
        return true
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if captureIfDownload(url) {
            decisionHandler(.cancel)
            return
        }

        let scheme = url?.scheme?.lowercased() ?? ""
        if scheme == "about" || scheme == "blob" || scheme == "data" || scheme.isEmpty {
            decisionHandler(.allow)
            return
        }

        let host = url?.host?.lowercased() ?? ""
        let tornado = host.contains("tornadomovies")
        let loadshare = host.contains("loadshare")
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

        if tornado {
            decisionHandler(.allow)
            return
        }
        if loadshare && !isMainFrame {
            decisionHandler(.allow)
            return
        }

        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let href = webView.url?.absoluteString, href.hasPrefix("http") else { return }
        guard shouldReady(webView) else { return }
        signalReady()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        reportLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        reportLoadFailure(error)
    }

    private func reportLoadFailure(_ error: Error) {
        let ns = error as NSError
        if ns.code == NSURLErrorCancelled { return }
        guard !finished else { return }
        onLoadFailed(ns)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard !finished else { return }
        finished = true
        onProcessTerminated()
    }
}

private final class RedirectCatcher: NSObject, URLSessionTaskDelegate {
    var captured: URL?

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        if let url = newRequest.url,
           url.absoluteString.range(of: "loadshare.org/download/", options: .caseInsensitive) != nil {
            captured = url
            completionHandler(nil)
            return
        }
        completionHandler(newRequest)
    }
}

private final class ScrapeUIDelegate: NSObject, WKUIDelegate {
    var onDownloadLink: ((String) -> Void)?

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let text = navigationAction.request.url?.absoluteString,
           text.range(of: "loadshare.org/download/", options: .caseInsensitive) != nil {
            onDownloadLink?(text)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(false)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        completionHandler(nil)
    }
}

private struct StorageSettingsPayload: Codable {
    var localVideoFolder: String
    var localSubfolder: String
    var nasHost: String
    var nasShare: String
    var nasPath: String
    var nasUsername: String
    var nasPassword: String
}

private final class ActiveFileDownload: NSObject, URLSessionDownloadDelegate {
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var finished = false
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private var destinationURL: URL?
    private var expectedFileName = "download.mp4"
    private(set) var status: [String: Any] = ["state": "idle"]

    func start(
        url: URL,
        destinationFolder: URL,
        fileName: String,
        referer: String?,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        stop()
        finished = false
        self.completion = completion
        expectedFileName = fileName
        destinationURL = destinationFolder.appendingPathComponent(fileName)
        status = [
            "state": "running",
            "phase": "Downloading...",
            "outputName": fileName,
            "outputSize": 0,
            "percent": 0
        ]

        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 60 * 60 * 8
        session = URLSession(configuration: config, delegate: self, delegateQueue: .main)

        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60 * 60)
        request.setValue(desktopUserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        request.setValue(siteOrigin, forHTTPHeaderField: "Origin")
        if let referer = referer?.trimmingCharacters(in: .whitespacesAndNewlines), !referer.isEmpty {
            request.setValue(referer, forHTTPHeaderField: "Referer")
        } else {
            request.setValue("\(siteOrigin)/tornado-1", forHTTPHeaderField: "Referer")
        }

        task = session?.downloadTask(with: request)
        task?.resume()
    }

    func stop() {
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        if !finished {
            status = ["state": "idle"]
        }
    }

    private func finish(with result: Result<[String: Any], Error>) {
        guard !finished else { return }
        finished = true
        switch result {
        case .success(let payload):
            status = payload
        case .failure(let error):
            status = [
                "state": "failed",
                "lastLogLine": error.localizedDescription,
                "outputName": expectedFileName
            ]
        }
        completion?(result)
        completion = nil
        session?.finishTasksAndInvalidate()
        session = nil
        task = nil
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        let percent: Int
        if totalBytesExpectedToWrite > 0 {
            percent = Int((Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)) * 100)
        } else {
            percent = 0
        }
        status = [
            "state": "running",
            "phase": "Downloading...",
            "outputName": expectedFileName,
            "outputSize": NSNumber(value: totalBytesWritten),
            "totalSize": NSNumber(value: totalBytesExpectedToWrite),
            "percent": percent
        ]
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let destinationURL = destinationURL else {
            finish(with: .failure(NSError(domain: "MovieEngine", code: 200, userInfo: [
                NSLocalizedDescriptionKey: "Missing download destination."
            ])))
            return
        }

        if let http = downloadTask.response as? HTTPURLResponse,
           !(200...299).contains(http.statusCode) {
            finish(with: .failure(NSError(domain: "MovieEngine", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: "Download failed (HTTP \(http.statusCode)). The link may have expired."
            ])))
            return
        }

        do {
            try FileManager.default.createDirectory(
                at: destinationURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            do {
                try FileManager.default.copyItem(at: location, to: destinationURL)
            } catch {
                try FileManager.default.moveItem(at: location, to: destinationURL)
            }
            let attrs = try FileManager.default.attributesOfItem(atPath: destinationURL.path)
            let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
            if size < minimumVideoBytes || fileLooksLikeWebpage(at: destinationURL) {
                try? FileManager.default.removeItem(at: destinationURL)
                finish(with: .failure(NSError(domain: "MovieEngine", code: 201, userInfo: [
                    NSLocalizedDescriptionKey: "Download finished, but the file was not a video (\(size) bytes). The link may have expired."
                ])))
                return
            }
            finish(with: .success([
                "state": "finished",
                "phase": "Complete",
                "outputPath": destinationURL.path,
                "outputName": expectedFileName,
                "outputSize": NSNumber(value: size),
                "percent": 100
            ]))
        } catch {
            finish(with: .failure(error))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if finished { return }
        guard let error = error as NSError? else { return }
        if error.code == NSURLErrorCancelled {
            status = ["state": "idle"]
            finished = true
            completion = nil
            return
        }
        finish(with: .failure(error))
    }

    private func fileLooksLikeWebpage(at url: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? handle.close() }
        let data = handle.readData(ofLength: 96)
        guard let prefix = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return false
        }
        return prefix.hasPrefix("<")
            || prefix.hasPrefix("<!doctype")
            || prefix.contains("<html")
            || (prefix.contains("error") && prefix.contains("expired"))
    }
}

private final class SiteLoginViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    var onFinished: ((Bool) -> Void)?
    private let prefillUser: String
    private let prefillPass: String
    private var didPrefill = false
    private var finished = false
    private var pollTimer: Timer?

    init(webView: WKWebView, username: String, password: String) {
        self.webView = webView
        self.prefillUser = username
        self.prefillPass = password
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.07, alpha: 1)
        title = "Tornado Sign In"
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Cancel",
            style: .plain,
            target: self,
            action: #selector(cancelTapped)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "Done",
            style: .done,
            target: self,
            action: #selector(doneTapped)
        )

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startPolling()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        pollTimer?.invalidate()
        pollTimer = nil
    }

    @objc private func cancelTapped() {
        finish(success: false)
    }

    @objc private func doneTapped() {
        checkLoggedIn { [weak self] ok in
            guard let self else { return }
            if ok {
                self.finish(success: true)
                return
            }
            let alert = UIAlertController(
                title: "Not signed in yet",
                message: "Complete Tornado’s captcha, tap Sign In on that page, then tap Done.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            self.present(alert, animated: true)
        }
    }

    private func finish(success: Bool) {
        guard !finished else { return }
        finished = true
        pollTimer?.invalidate()
        pollTimer = nil
        let callback = onFinished
        onFinished = nil
        dismiss(animated: true) {
            callback?(success)
        }
    }

    private func startPolling() {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.9, repeats: true) { [weak self] _ in
            self?.prefillFields()
            self?.checkLoggedIn { ok in
                if ok { self?.finish(success: true) }
            }
        }
    }

    private func checkLoggedIn(completion: @escaping (Bool) -> Void) {
        let script = """
        (function() {
          return !!document.querySelector('a[href*="logout"], a[href*="signout"], a[href*="sign-out"]');
        })()
        """
        webView.evaluateJavaScript(script) { result, _ in
            let ok = (result as? Bool) == true || (result as? NSNumber)?.boolValue == true
            DispatchQueue.main.async { completion(ok) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if navigationAction.targetFrame == nil {
            if isAllowedLoginURL(navigationAction.request.url, isMainFrame: false) {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
            return
        }
        if isAllowedLoginURL(navigationAction.request.url, isMainFrame: isMainFrame) {
            decisionHandler(.allow)
            return
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript(loginPageHelperScript, completionHandler: nil)
        prefillFields()
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(false)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        completionHandler(nil)
    }

    private func prefillFields() {
        guard !prefillUser.isEmpty, !didPrefill else { return }
        func encode(_ value: String) -> String {
            guard let data = try? JSONEncoder().encode(value),
                  let text = String(data: data, encoding: .utf8) else {
                return "\"\""
            }
            return text
        }
        let script = """
        (function() {
          function setValue(el, value) {
            if (!el) return;
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          var email = document.querySelector('#modal_block input[name="SignupForm[email]"]')
            || document.querySelector('input[name="SignupForm[email]"]');
          var password = document.querySelector('#modal_block input[name="SignupForm[password]"]')
            || document.querySelector('input[name="SignupForm[password]"]');
          if (!email || !password) return false;
          setValue(email, \(encode(prefillUser)));
          setValue(password, \(encode(prefillPass)));
          var remember = document.querySelector('#modal_block input[name="SignupForm[rememberMe]"][type="checkbox"]')
            || document.querySelector('input[name="SignupForm[rememberMe]"][type="checkbox"]');
          if (remember) remember.checked = true;
          return true;
        })();
        """
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            let ok = (result as? Bool) == true || (result as? NSNumber)?.boolValue == true
            if ok {
                DispatchQueue.main.async { self?.didPrefill = true }
            }
        }
    }
}

private struct PlaybackPosition: Codable {
    var seconds: Double
    var duration: Double
}

private final class LibraryPlaybackController: AVPlayerViewController {
    var videoKey = ""
    var onSave: ((String, Double, Double) -> Void)?
    var onClose: (() -> Void)?
    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private var didClose = false

    func configure(url: URL, startAt seconds: Double) {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        self.player = player
        allowsPictureInPicturePlayback = true
        updatesNowPlayingInfoCenter = true
        modalPresentationStyle = .fullScreen

        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard item.status == .readyToPlay else { return }
            self?.statusObserver?.invalidate()
            self?.statusObserver = nil
            let duration = CMTimeGetSeconds(item.duration)
            var resume = seconds
            if duration.isFinite, duration > 15, resume >= duration - 12 {
                resume = 0
            }
            if resume > 5, resume.isFinite {
                player.seek(to: CMTime(seconds: resume, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { _ in
                    player.play()
                }
            } else {
                player.play()
            }
        }

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 4, preferredTimescale: 600),
            queue: .main
        ) { [weak self] _ in
            self?.persist()
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            guard let self, let player = self.player else { return }
            let duration = CMTimeGetSeconds(player.currentItem?.duration ?? .zero)
            self.onSave?(self.videoKey, duration.isFinite ? duration : 0, duration.isFinite ? duration : 0)
        }
    }

    func persist() {
        guard let player else { return }
        let seconds = CMTimeGetSeconds(player.currentTime())
        var duration = CMTimeGetSeconds(player.currentItem?.duration ?? .zero)
        if !duration.isFinite || duration <= 0 { return }
        guard seconds.isFinite, seconds >= 0 else { return }
        onSave?(videoKey, min(seconds, duration), duration)
    }

    override func viewWillDisappear(_ animated: Bool) {
        persist()
        super.viewWillDisappear(animated)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard !didClose, isBeingDismissed || presentingViewController == nil else { return }
        didClose = true
        cleanup()
        onClose?()
    }

    private func cleanup() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        statusObserver?.invalidate()
        statusObserver = nil
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = nil
        player?.pause()
    }

    deinit {
        cleanup()
    }
}

@objc(MovieEnginePlugin)
public class MovieEnginePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MovieEnginePlugin"
    public let jsName = "MovieEngine"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStorageSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveStorageSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocalMoviesPath", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureLocalFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listLocalDownloads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectNas", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testNasWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openLocalFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scrapePage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abortScrape", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "siteLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSiteLogin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rememberSiteCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchDirectLinks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDownloadStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearDownloadJob", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadArtwork", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchMoviePoster", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playFeedback", returnType: CAPPluginReturnPromise)
    ]

    private static let appDisplayName = "Cinarip"
    private static let appDownloadsFolderName = "Downloads"
    private static let videoExtensions: Set<String> = ["mp4", "mkv", "mov", "m4v", "avi", "webm"]

    private let settingsKey = "movie_engine_storage_settings"
#if !targetEnvironment(simulator)
    private var cachedClient: AMSMB2?
#endif
    private var scrapeWebView: WKWebView?
    private var scrapeDelegate: ScrapeNavigationDelegate?
    private var scrapeResolved = false
    private var scrapeWorkQueue: [() -> Void] = []
    private var scrapeRunning = false
    private var scrapeSessionId = 0
    private var activeDownload: ActiveFileDownload?
    private var siteLoginAt: Date?
    private var siteLoginUser: String?
    private var siteLoginPassword: String?
    private var scrapeRuleList: WKContentRuleList?
    private var scrapeUIDelegate = ScrapeUIDelegate()
    private var scrapeHostWindow: UIWindow?
    private var capturedDownloadLinks: [String] = []
    private var scrapeLoadRetries = 0
    private var loginWebView: WKWebView?
    private var loginPresenter: UIViewController?
    private var libraryPlayer: LibraryPlaybackController?
    private let playbackStoreKey = "movie_engine_playback_positions"
    private lazy var lightImpact = UIImpactFeedbackGenerator(style: .light)
    private lazy var softImpact = UIImpactFeedbackGenerator(style: .soft)
    private lazy var mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    private lazy var selectionFeedback = UISelectionFeedbackGenerator()
    private lazy var notifyFeedback = UINotificationFeedbackGenerator()
    private lazy var siteSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 20
        return URLSession(configuration: config)
    }()

    private static let scrapeProcessPool = WKProcessPool()

    private func resetScrapeWebView() {
        teardownScrapeWebView()
    }

    private func teardownScrapeWebView() {
        scrapeWebView?.stopLoading()
        scrapeWebView?.navigationDelegate = nil
        scrapeWebView?.uiDelegate = nil
        scrapeWebView?.removeFromSuperview()
        scrapeWebView = nil
        scrapeDelegate = nil
    }

    private func attachScrapeWebView(_ webView: WKWebView) {
        if scrapeHostWindow == nil {
            let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
            let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: CGRect(x: 0, y: -4000, width: 1280, height: 800))
            window.frame = CGRect(x: 0, y: -4000, width: 1280, height: 800)
            window.windowLevel = UIWindow.Level(rawValue: -1)
            window.backgroundColor = .clear
            window.isUserInteractionEnabled = false
            let host = UIViewController()
            host.view.backgroundColor = .clear
            window.rootViewController = host
            scrapeHostWindow = window
        }
        guard let host = scrapeHostWindow, let container = host.rootViewController?.view else { return }
        webView.frame = CGRect(x: 0, y: 0, width: 1280, height: 800)
        if webView.superview !== container {
            webView.removeFromSuperview()
            container.addSubview(webView)
        }
        host.alpha = 0.02
        host.isHidden = false
    }

    @discardableResult
    private func ensureScrapeWebView() -> WKWebView {
        if let webView = scrapeWebView {
            attachScrapeWebView(webView)
            return webView
        }

        let config = WKWebViewConfiguration()
        config.processPool = Self.scrapeProcessPool
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.allowsInlineMediaPlayback = false
        config.allowsPictureInPictureMediaPlayback = false
        config.allowsAirPlayForMediaPlayback = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        if let scrapeRuleList {
            config.userContentController.add(scrapeRuleList)
        }

        config.userContentController.addUserScript(
            WKUserScript(source: chromeCompatScript + "\n" + networkHookScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        )

        let scraperBundle = loadBundledScraperScript()
        if !scraperBundle.isEmpty {
            let userScript = WKUserScript(
                source: scraperBundle + "\n;void 0;",
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
            config.userContentController.addUserScript(userScript)
        }

        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1280, height: 800), configuration: config)
        webView.isHidden = false
        webView.isOpaque = true
        webView.isUserInteractionEnabled = false
        webView.customUserAgent = desktopUserAgent
        webView.uiDelegate = scrapeUIDelegate
        scrapeUIDelegate.onDownloadLink = { [weak self] link in
            guard let self, !self.capturedDownloadLinks.contains(link) else { return }
            self.capturedDownloadLinks.append(link)
        }
        scrapeWebView = webView
        attachScrapeWebView(webView)

        return webView
    }

    private func drainScrapeQueue() {
        guard !scrapeRunning, !scrapeWorkQueue.isEmpty else { return }
        scrapeRunning = true
        let work = scrapeWorkQueue.removeFirst()
        work()
    }

    private func finishScrapeWork() {
        scrapeRunning = false
        drainScrapeQueue()
    }

    private func defaults() -> StorageSettingsPayload {
        StorageSettingsPayload(
            localVideoFolder: "",
            localSubfolder: Self.appDownloadsFolderName,
            nasHost: "",
            nasShare: "",
            nasPath: "Videos",
            nasUsername: "",
            nasPassword: ""
        )
    }

    public override func load() {
        super.load()
        ensureAppDownloadsFolder()
        compileScrapeBlockers()
        DispatchQueue.main.async {
            self.lightImpact.prepare()
            self.softImpact.prepare()
            self.selectionFeedback.prepare()
            self.notifyFeedback.prepare()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            let webView = self.ensureScrapeWebView()
            self.attachScrapeWebView(webView)
            if webView.url == nil {
                webView.load(URLRequest(url: URL(string: "about:blank")!))
            }
        }
    }

    private func compileScrapeBlockers() {
        let adDomains = [
            "doubleclick.net", "*doubleclick.net",
            "googlesyndication.com", "*googlesyndication.com",
            "googletagmanager.com", "*googletagmanager.com",
            "googleadservices.com", "*googleadservices.com",
            "addthis.com", "*addthis.com",
            "scorecardresearch.com", "*scorecardresearch.com",
            "facebook.net", "*facebook.net",
            "primisemets.com", "*primisemets.com",
            "thegreattech.com", "*thegreattech.com",
            "totalav.com", "*totalav.com",
            "mcafee.com", "*mcafee.com",
            "ezexfzek.com", "*ezexfzek.com",
            "popads.net", "*popads.net",
            "propellerads.com", "*propellerads.com",
            "adsterra.com", "*adsterra.com",
            "exoclick.com", "*exoclick.com",
            "juicyads.com", "*juicyads.com"
        ]
        let rules: [[String: Any]] = [
            [
                "trigger": ["url-filter": ".*", "resource-type": ["media"]],
                "action": ["type": "block"]
            ],
            [
                "trigger": ["url-filter": ".*", "if-domain": adDomains],
                "action": ["type": "block"]
            ],
            [
                "trigger": ["url-filter": ".*\\.mp4"],
                "action": ["type": "block"]
            ],
            [
                "trigger": ["url-filter": ".*\\.m3u8"],
                "action": ["type": "block"]
            ],
            [
                "trigger": ["url-filter": ".*\\.webm"],
                "action": ["type": "block"]
            ]
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: rules),
              let encoded = String(data: data, encoding: .utf8) else {
            return
        }
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "cinarip-login-blockers-v2",
            encodedContentRuleList: encoded
        ) { list, error in
            DispatchQueue.main.async {
                if let error {
                    NSLog("[Cinarip] content rules failed: %@", error.localizedDescription)
                    return
                }
                guard let list else { return }
                self.scrapeRuleList = list
                self.scrapeWebView?.configuration.userContentController.add(list)
            }
        }
    }

    @discardableResult
    private func ensureAppDownloadsFolder() -> URL {
        var settings = loadSettings()
        settings.localSubfolder = Self.appDownloadsFolderName
        saveSettings(settings)

        let url = localMoviesURL(settings: settings)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)

        let marker = url.appendingPathComponent(".downloads-folder", isDirectory: false)
        if !FileManager.default.fileExists(atPath: marker.path) {
            let text = "\(Self.appDisplayName) saves videos in this app folder.\n"
            try? text.data(using: .utf8)?.write(to: marker)
        }

        return url
    }

    private func titleFromFilename(_ fileName: String) -> String {
        let base = (fileName as NSString).deletingPathExtension
        let cleaned = base
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: ".", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? fileName : cleaned
    }

    private func isVideoFile(_ fileName: String) -> Bool {
        let ext = (fileName as NSString).pathExtension.lowercased()
        return Self.videoExtensions.contains(ext)
    }

    private func scanVideos(in directory: URL, maxDepth: Int, depth: Int = 0) -> [[String: Any]] {
        guard depth <= maxDepth else { return [] }

        let entries: [URL]
        do {
            entries = try FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey],
                options: [.skipsHiddenFiles]
            )
        } catch {
            return []
        }

        var movies: [[String: Any]] = []

        for entry in entries {
            let values = try? entry.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey])
            if values?.isDirectory == true {
                movies.append(contentsOf: scanVideos(in: entry, maxDepth: maxDepth, depth: depth + 1))
                continue
            }

            let fileName = entry.lastPathComponent
            guard isVideoFile(fileName) else { continue }

            let size = Int64(values?.fileSize ?? 0)
            guard size >= minimumVideoBytes else { continue }

            var item: [String: Any] = [
                "filePath": entry.path,
                "fileName": fileName,
                "title": titleFromFilename(fileName),
                "size": NSNumber(value: size),
                "modifiedAt": NSNumber(value: (values?.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000),
                "kind": "movie"
            ]
            if let posterPath = posterPathString(for: entry) {
                item["posterPath"] = posterPath
                item["posterUrl"] = thumbnailDataURL(from: posterPath) ?? NSNull()
            } else {
                item["posterPath"] = NSNull()
                item["posterUrl"] = NSNull()
            }
            for (key, value) in playbackFields(for: entry.path) {
                item[key] = value
            }
            movies.append(item)
        }

        return movies.sorted {
            (($0["title"] as? String) ?? "").localizedCaseInsensitiveCompare(($1["title"] as? String) ?? "") == .orderedAscending
        }
    }

    private func posterSidecarURL(for video: URL) -> URL {
        let name = video.deletingPathExtension().lastPathComponent + "-poster.jpg"
        return video.deletingLastPathComponent().appendingPathComponent(name)
    }

    private func posterPathString(for video: URL) -> String? {
        let sidecar = posterSidecarURL(for: video)
        if FileManager.default.fileExists(atPath: sidecar.path),
           let image = UIImage(contentsOfFile: sidecar.path),
           averageLuma(image) >= 0.11 {
            return sidecar.path
        }
        if generatePosterFrame(from: video, to: sidecar) {
            return sidecar.path
        }
        if FileManager.default.fileExists(atPath: sidecar.path) {
            return sidecar.path
        }
        return nil
    }

    private func thumbnailDataURL(from path: String) -> String? {
        guard let image = UIImage(contentsOfFile: path) else { return nil }
        let maxWidth: CGFloat = 240
        let scale = min(1, maxWidth / max(image.size.width, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        let tiny = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = tiny.jpegData(compressionQuality: 0.72), jpeg.count > 400, jpeg.count < 180_000 else {
            return nil
        }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }

    private func averageLuma(_ image: UIImage) -> CGFloat {
        guard let cgImage = image.cgImage else { return 0 }
        let width = 24
        let height = 24
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return 0 }
        context.interpolationQuality = .low
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        var total = 0
        for index in stride(from: 0, to: pixels.count, by: 4) {
            total += Int(pixels[index]) + Int(pixels[index + 1]) + Int(pixels[index + 2])
        }
        return CGFloat(total) / CGFloat(width * height * 3) / 255.0
    }

    @discardableResult
    private func generatePosterFrame(from video: URL, to destination: URL) -> Bool {
        let asset = AVURLAsset(url: video)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 640, height: 960)
        generator.requestedTimeToleranceBefore = CMTime(seconds: 1.5, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 2.5, preferredTimescale: 600)

        let duration = CMTimeGetSeconds(asset.duration)
        var candidates: [Double] = [12, 24, 40, 75, 120]
        if duration.isFinite, duration > 20 {
            candidates.append(contentsOf: [duration * 0.12, duration * 0.22, duration * 0.35])
        }
        var bestImage: UIImage?
        var bestLuma: CGFloat = -1
        for seconds in candidates where seconds >= 0 {
            if duration.isFinite, duration > 2, seconds >= duration - 2 { continue }
            let time = CMTime(seconds: seconds, preferredTimescale: 600)
            guard let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) else { continue }
            let image = UIImage(cgImage: cgImage)
            let luma = averageLuma(image)
            if luma > bestLuma {
                bestLuma = luma
                bestImage = image
            }
            if luma >= 0.18 { break }
        }
        guard let image = bestImage, let jpeg = image.jpegData(compressionQuality: 0.74) else {
            return false
        }
        do {
            try jpeg.write(to: destination, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    @objc func downloadArtwork(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: urlString) else {
            call.resolve(["ok": false, "error": "Missing artwork url."])
            return
        }
        let videoPath = call.getString("videoPath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !videoPath.isEmpty else {
            call.resolve(["ok": false, "error": "Missing video path."])
            return
        }
        let destination = posterSidecarURL(for: URL(fileURLWithPath: videoPath))
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        applySiteHeaders(&request, referer: URL(string: call.getString("referer") ?? siteOrigin), ajax: false)
        request.setValue("image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")

        siteSession.dataTask(with: request) { data, response, error in
            if let error {
                call.resolve(["ok": false, "error": error.localizedDescription])
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200...299).contains(status), let data, data.count > 400, !self.dataLooksLikeHTML(data) else {
                call.resolve(["ok": false, "error": "Artwork download failed (HTTP \(status))."])
                return
            }
            do {
                try FileManager.default.createDirectory(
                    at: destination.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try data.write(to: destination, options: .atomic)
                call.resolve(["ok": true, "path": destination.path])
            } catch {
                call.resolve(["ok": false, "error": error.localizedDescription])
            }
        }.resume()
    }

    @objc func fetchMoviePoster(_ call: CAPPluginCall) {
        let videoPath = call.getString("videoPath")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !videoPath.isEmpty else {
            call.resolve(["ok": false, "error": "Missing video path."])
            return
        }
        let hint = call.getString("posterUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let pageRaw = call.getString("pageUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let destination = posterSidecarURL(for: URL(fileURLWithPath: videoPath))
        let pageURL = catalogMovieURL(from: pageRaw)

        DispatchQueue.global(qos: .userInitiated).async {
            var candidates: [URL] = []
            if let hintURL = self.normalizedImageURL(hint) {
                candidates.append(hintURL)
            }
            if let pageURL, let html = self.fetchHTML(pageURL) {
                candidates.append(contentsOf: self.extractPosterURLs(from: html, base: pageURL))
            }

            var seen = Set<String>()
            for url in candidates {
                let key = url.absoluteString
                if seen.contains(key) { continue }
                seen.insert(key)
                if self.downloadPosterImage(url, referer: pageURL, to: destination) {
                    DispatchQueue.main.async {
                        call.resolve(["ok": true, "path": destination.path, "source": url.absoluteString])
                    }
                    return
                }
            }
            DispatchQueue.main.async {
                call.resolve(["ok": false, "error": "Could not fetch a Tornado poster."])
            }
        }
    }

    private func catalogMovieURL(from raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, var url = URL(string: trimmed) else { return nil }
        var path = url.path
        if let range = path.range(of: "-watching", options: .caseInsensitive) {
            path = String(path[..<range.lowerBound])
        }
        path = path.replacingOccurrences(of: ".html", with: "", options: .caseInsensitive)
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.path = path
        components?.query = nil
        components?.fragment = nil
        return components?.url ?? url
    }

    private func normalizedImageURL(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("//") { text = "https:" + text }
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return nil
        }
        if url.host?.contains("tornadomovies") == true || url.host?.contains("static.") == true {
            return url
        }
        if text.contains("/images/movie/") || text.contains("/uploads/") {
            return url
        }
        return url
    }

    private func fetchHTML(_ url: URL) -> String? {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        applySiteHeaders(&request, referer: URL(string: "\(siteOrigin)/tornado-1"), ajax: false)
        let semaphore = DispatchSemaphore(value: 0)
        var html: String?
        siteSession.dataTask(with: request) { data, _, _ in
            if let data {
                html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1)
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 22)
        return html
    }

    private func extractPosterURLs(from html: String, base: URL) -> [URL] {
        var found: [URL] = []
        let patterns = [
            "property=[\"']og:image[\"'][^>]*content=[\"'](https://[^\"']+)[\"']",
            "content=[\"'](https://[^\"']+)[\"'][^>]*property=[\"']og:image[\"']",
            "name=[\"']twitter:image[\"'][^>]*content=[\"'](https://[^\"']+)[\"']",
            "data-img=[\"'](https://[^\"']+)[\"']"
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { continue }
            let ns = html as NSString
            let matches = regex.matches(in: html, range: NSRange(location: 0, length: ns.length))
            for match in matches where match.numberOfRanges > 1 {
                let raw = ns.substring(with: match.range(at: 1))
                if let url = normalizedImageURL(raw) ?? URL(string: raw, relativeTo: base)?.absoluteURL {
                    if url.host?.contains("tornadomovies") == true || raw.contains("/images/movie/") {
                        found.append(url)
                    }
                }
            }
        }
        let preferred = found.filter { $0.absoluteString.contains("/images/movie/") }
        return preferred.isEmpty ? found : preferred + found.filter { !$0.absoluteString.contains("/images/movie/") }
    }

    @discardableResult
    private func downloadPosterImage(_ url: URL, referer: URL?, to destination: URL) -> Bool {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        applySiteHeaders(&request, referer: referer ?? URL(string: siteOrigin), ajax: false)
        request.setValue("image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")
        let semaphore = DispatchSemaphore(value: 0)
        var imageData: Data?
        siteSession.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let type = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.lowercased() ?? ""
            if (200...299).contains(status), let data, data.count > 1500, !self.dataLooksLikeHTML(data) {
                if type.contains("image") || type.isEmpty || data.count > 8000 {
                    imageData = data
                }
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 22)
        guard let imageData else { return false }
        do {
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try imageData.write(to: destination, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    private func dataLooksLikeHTML(_ data: Data) -> Bool {
        guard let prefix = String(data: data.prefix(80), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() else {
            return false
        }
        return prefix.hasPrefix("<") || prefix.hasPrefix("<!doctype") || prefix.contains("<html")
    }

    private func loadPlaybackMap() -> [String: PlaybackPosition] {
        guard let data = UserDefaults.standard.data(forKey: playbackStoreKey),
              let decoded = try? JSONDecoder().decode([String: PlaybackPosition].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private func savePlayback(path: String, seconds: Double, duration: Double) {
        var map = loadPlaybackMap()
        map[path] = PlaybackPosition(seconds: seconds, duration: duration)
        if let data = try? JSONEncoder().encode(map) {
            UserDefaults.standard.set(data, forKey: playbackStoreKey)
        }
    }

    private func playbackFields(for path: String) -> [String: Any] {
        guard let entry = loadPlaybackMap()[path], entry.duration > 1 else { return [:] }
        let progress = min(1, max(0, entry.seconds / entry.duration))
        return [
            "playbackSeconds": NSNumber(value: entry.seconds),
            "durationSeconds": NSNumber(value: entry.duration),
            "playbackProgress": NSNumber(value: progress)
        ]
    }

    @objc func playFeedback(_ call: CAPPluginCall) {
        let kind = call.getString("kind")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "tap"
        DispatchQueue.main.async {
            self.performFeedback(kind)
            call.resolve(["ok": true])
        }
    }

    private func performFeedback(_ kind: String) {
        switch kind {
        case "select", "toggle":
            selectionFeedback.selectionChanged()
            selectionFeedback.prepare()
            playSystemSound(1104)
        case "open", "nav":
            lightImpact.impactOccurred()
            lightImpact.prepare()
            playSystemSound(1104)
        case "close", "back":
            softImpact.impactOccurred()
            softImpact.prepare()
            playSystemSound(1104)
        case "confirm", "queued":
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
            playSystemSound(1104)
        case "start":
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
            playSystemSound(1113)
        case "play":
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
        case "success", "done":
            notifyFeedback.notificationOccurred(.success)
            notifyFeedback.prepare()
            playSystemSound(1057)
        case "warning", "stop":
            notifyFeedback.notificationOccurred(.warning)
            notifyFeedback.prepare()
        case "error", "fail":
            notifyFeedback.notificationOccurred(.error)
            notifyFeedback.prepare()
            playSystemSound(1073)
        default:
            lightImpact.impactOccurred()
            lightImpact.prepare()
            playSystemSound(1104)
        }
    }

    private func playSystemSound(_ soundID: SystemSoundID) {
        AudioServicesPlaySystemSound(soundID)
    }

    @objc func playVideo(_ call: CAPPluginCall) {
        let path = call.getString("path")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !path.isEmpty, FileManager.default.fileExists(atPath: path) else {
            DispatchQueue.main.async { self.performFeedback("error") }
            call.resolve(["ok": false, "error": "That video file is missing."])
            return
        }
        let url = URL(fileURLWithPath: path)
        let saved = loadPlaybackMap()[path]?.seconds ?? 0

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.resolve(["ok": false, "error": "Could not open the player."])
                return
            }
            if presenter.presentedViewController != nil, self.libraryPlayer == nil {
                call.resolve(["ok": false, "error": "Close the current screen, then open the movie again."])
                return
            }

            self.libraryPlayer?.persist()
            self.libraryPlayer?.dismiss(animated: false)

            let controller = LibraryPlaybackController()
            controller.videoKey = path
            controller.onSave = { [weak self] key, seconds, duration in
                self?.savePlayback(path: key, seconds: seconds, duration: duration)
            }
            controller.onClose = { [weak self] in
                self?.libraryPlayer = nil
                call.resolve(["ok": true, "resumed": saved > 5])
            }
            controller.configure(url: url, startAt: saved)
            self.libraryPlayer = controller
            self.performFeedback("play")
            presenter.present(controller, animated: true)
        }
    }

    private func loadSettings() -> StorageSettingsPayload {
        guard
            let data = UserDefaults.standard.data(forKey: settingsKey),
            let decoded = try? JSONDecoder().decode(StorageSettingsPayload.self, from: data)
        else {
            return defaults()
        }
        return decoded
    }

    private func saveSettings(_ settings: StorageSettingsPayload) {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: settingsKey)
        }
    }

    private func documentsDirectory() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    private func localMoviesURL(settings: StorageSettingsPayload) -> URL {
        return documentsDirectory().appendingPathComponent(Self.appDownloadsFolderName, isDirectory: true)
    }

    private func displayPath(for url: URL) -> String {
        "On My iPhone > \(Self.appDisplayName) > \(Self.appDownloadsFolderName)"
    }

    @objc func getStorageSettings(_ call: CAPPluginCall) {
        let settings = loadSettings()
        let localURL = localMoviesURL(settings: settings)
        call.resolve([
            "localVideoFolder": localURL.path,
            "localSubfolder": settings.localSubfolder,
            "nasHost": settings.nasHost,
            "nasShare": settings.nasShare,
            "nasPath": settings.nasPath,
            "nasUsername": settings.nasUsername,
            "nasPassword": settings.nasPassword,
            "localDisplayPath": displayPath(for: localURL),
            "nasVideoFolder": buildNasDisplayPath(settings: settings)
        ])
    }

    private func applyNasFields(from call: CAPPluginCall, into settings: inout StorageSettingsPayload) {
        if let value = call.getString("host") ?? call.getString("nasHost") { settings.nasHost = value }
        if let value = call.getString("share") ?? call.getString("nasShare") { settings.nasShare = value }
        if let value = call.getString("path") ?? call.getString("nasPath") { settings.nasPath = value }
        if let value = call.getString("username") ?? call.getString("nasUsername") { settings.nasUsername = value }
        let password = call.getString("password") ?? call.getString("nasPassword")
        if let password, !password.isEmpty {
            settings.nasPassword = password
        }
    }

    @objc func saveStorageSettings(_ call: CAPPluginCall) {
        var settings = loadSettings()
        settings.localSubfolder = Self.appDownloadsFolderName
        applyNasFields(from: call, into: &settings)
        saveSettings(settings)
        call.resolve(["ok": true])
    }

    @objc func getLocalMoviesPath(_ call: CAPPluginCall) {
        let settings = loadSettings()
        let url = localMoviesURL(settings: settings)
        call.resolve([
            "path": url.path,
            "displayPath": displayPath(for: url)
        ])
    }

    @objc func ensureLocalFolder(_ call: CAPPluginCall) {
        let url = ensureAppDownloadsFolder()
        call.resolve([
            "ok": true,
            "path": url.path,
            "displayPath": displayPath(for: url)
        ])
    }

    @objc func listLocalDownloads(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let url = self.ensureAppDownloadsFolder()
            let movies = self.scanVideos(in: url, maxDepth: 4)
            DispatchQueue.main.async {
                call.resolve([
                    "location": "local",
                    "folderPath": url.path,
                    "displayPath": self.displayPath(for: url),
                    "exists": true,
                    "accessible": true,
                    "error": NSNull(),
                    "movies": movies,
                    "entries": movies,
                    "movieCount": movies.count,
                    "showCount": 0,
                    "episodeCount": 0
                ])
            }
        }
    }

    private func buildNasDisplayPath(settings: StorageSettingsPayload) -> String {
        guard !settings.nasHost.isEmpty, !settings.nasShare.isEmpty else { return "" }
        let remotePath = settings.nasPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if remotePath.isEmpty {
            return "smb://\(settings.nasHost)/\(settings.nasShare)"
        }
        return "smb://\(settings.nasHost)/\(settings.nasShare)/\(remotePath)"
    }

    private func smbClient(settings: StorageSettingsPayload, completion: @escaping (Result<Any, Error>) -> Void) {
#if targetEnvironment(simulator)
        completion(.failure(NSError(domain: "MovieEngine", code: 100, userInfo: [
            NSLocalizedDescriptionKey: "NAS/SMB requires a physical iPhone. Simulators can still browse and queue, but not connect to your NAS."
        ])))
        return
#else
        let host = settings.nasHost.trimmingCharacters(in: .whitespacesAndNewlines)
        let share = settings.nasShare.trimmingCharacters(in: .whitespacesAndNewlines)
        let username = settings.nasUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        let password = settings.nasPassword

        guard !host.isEmpty, !share.isEmpty else {
            completion(.failure(NSError(domain: "MovieEngine", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Enter NAS host and share name in Settings."
            ])))
            return
        }

        guard !username.isEmpty else {
            completion(.failure(NSError(domain: "MovieEngine", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Enter your NAS username in Settings."
            ])))
            return
        }

        guard let url = URL(string: "smb://\(host)") else {
            completion(.failure(NSError(domain: "MovieEngine", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Invalid NAS host."
            ])))
            return
        }

        let credential = URLCredential(user: username, password: password, persistence: .forSession)
        guard let client = AMSMB2(url: url, credential: credential) else {
            completion(.failure(NSError(domain: "MovieEngine", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Invalid SMB URL."
            ])))
            return
        }

        client.connectShare(name: share) { error in
            if let error = error {
                completion(.failure(error))
                return
            }
            self.cachedClient = client
            completion(.success(client))
        }
#endif
    }

    private func normalizedRemotePath(_ raw: String) -> String {
        raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    @objc func connectNas(_ call: CAPPluginCall) {
        var settings = loadSettings()
        applyNasFields(from: call, into: &settings)
        saveSettings(settings)

        smbClient(settings: settings) { result in
            switch result {
            case .failure(let error):
                call.resolve(["ok": false, "error": error.localizedDescription])
            case .success:
                call.resolve([
                    "ok": true,
                    "connected": true,
                    "path": self.buildNasDisplayPath(settings: settings)
                ])
            }
        }
    }

    @objc func testNasWrite(_ call: CAPPluginCall) {
        var settings = loadSettings()
        applyNasFields(from: call, into: &settings)
        saveSettings(settings)

        smbClient(settings: settings) { result in
            switch result {
            case .failure(let error):
                call.resolve(["ok": false, "error": error.localizedDescription])
            case .success(let clientValue):
#if targetEnvironment(simulator)
                call.resolve(["ok": false, "error": "NAS/SMB requires a physical iPhone."])
#else
                guard let client = clientValue as? AMSMB2 else {
                    call.resolve(["ok": false, "error": "SMB client unavailable."])
                    return
                }
                let remotePath = self.normalizedRemotePath(settings.nasPath)
                let targetDir = remotePath.isEmpty ? "/" : "/\(remotePath)"
                client.createDirectory(atPath: targetDir) { error in
                    if let error = error {
                        call.resolve(["ok": false, "error": error.localizedDescription])
                        return
                    }
                    let trimmed = targetDir.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                    let probePath = trimmed.isEmpty ? "/.movie-engine-probe" : "/\(trimmed)/.movie-engine-probe"
                    let payload = Data("ok".utf8)
                    client.write(data: payload, toPath: probePath, progress: nil) { error in
                        if let error = error {
                            call.resolve(["ok": false, "error": error.localizedDescription])
                            return
                        }
                        call.resolve([
                            "ok": true,
                            "path": self.buildNasDisplayPath(settings: settings)
                        ])
                    }
                }
#endif
            }
        }
    }

    @objc func openLocalFolder(_ call: CAPPluginCall) {
        let settings = loadSettings()
        let url = localMoviesURL(settings: settings)
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        } catch {
            call.reject("Could not open local folder.", nil, error)
            return
        }

        DispatchQueue.main.async {
            guard let root = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })?.rootViewController else {
                call.resolve(["ok": true])
                return
            }

            let controller = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
            controller.directoryURL = url
            controller.allowsMultipleSelection = false
            root.present(controller, animated: true)
            call.resolve(["ok": true])
        }
    }

    @objc func scrapePage(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing url")
            return
        }

        let userScript = call.getString("script") ?? "null"
        let waitMs = max(call.getInt("waitMs") ?? 3200, 400)
        let retryWaitMs = max(call.getInt("retryWaitMs") ?? 1800, 400)
        let injectScrapers = call.getBool("injectScrapers") ?? true
        let overallTimeoutMs = max(call.getInt("overallTimeoutMs") ?? 25000, 5000)
        let evalTimeoutMs = max(call.getInt("evalTimeoutMs") ?? min(overallTimeoutMs - 2000, 20000), 4000)

        DispatchQueue.main.async {
            self.scrapeWorkQueue.append {
                self.performScrape(
                    call: call,
                    url: url,
                    userScript: userScript,
                    waitMs: waitMs,
                    retryWaitMs: retryWaitMs,
                    injectScrapers: injectScrapers,
                    overallTimeoutMs: overallTimeoutMs,
                    evalTimeoutMs: evalTimeoutMs,
                    retriedAfterCrash: false
                )
            }
            self.drainScrapeQueue()
        }
    }

    @objc func abortScrape(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.scrapeSessionId += 1
            self.scrapeResolved = true
            self.scrapeWorkQueue.removeAll()
            self.scrapeWebView?.stopLoading()
            self.scrapeDelegate = nil
            if self.scrapeRunning {
                self.finishScrapeWork()
            }
            call.resolve(["ok": true])
        }
    }

    private func performScrape(
        call: CAPPluginCall,
        url: URL,
        userScript: String,
        waitMs: Int,
        retryWaitMs: Int,
        injectScrapers: Bool,
        overallTimeoutMs: Int,
        evalTimeoutMs: Int,
        retriedAfterCrash: Bool
    ) {
        scrapeSessionId += 1
        let sessionId = scrapeSessionId
        scrapeResolved = false
        capturedDownloadLinks = []
        scrapeLoadRetries = 0
        let webView = ensureScrapeWebView()
        webView.stopLoading()
        webView.evaluateJavaScript("window.__mobileScrapeJob = null; window.__mobileDlJob = null;") { _, _ in }

        let scraperBundle = injectScrapers ? loadBundledScraperScript() : ""
        let wrappedScript = """
        (function() {
          try {
            var value = (\(userScript));
            if (value && typeof value.then === "function") {
              return JSON.stringify({ pending: true, error: "async-not-detached" });
            }
            return JSON.stringify(value == null ? { ok: false, error: "empty scrape result" } : value);
          } catch (error) {
            return JSON.stringify({
              ok: false,
              error: String(error && error.message ? error.message : error)
            });
          }
        })()
        """

        var navTimeoutWorkItem: DispatchWorkItem?
        var overallTimeoutWorkItem: DispatchWorkItem?
        var scrapePassStarted = false

        func safeFinish(with result: Any?) {
            guard sessionId == self.scrapeSessionId else { return }
            guard !scrapeResolved else { return }
            scrapeResolved = true
            navTimeoutWorkItem?.cancel()
            overallTimeoutWorkItem?.cancel()
            scrapeDelegate = nil
            finishScrapeWork()

            let decoded = self.mergeCapturedLinks(self.decodeJavaScriptResult(result))
            if JSONSerialization.isValidJSONObject(decoded) {
                call.resolve(["ok": true, "result": decoded])
            } else {
                call.resolve(["ok": true, "result": ["ok": false, "error": "Scrape returned no data."]])
            }
        }

        func evaluateOnce(completion: @escaping (Any?) -> Void) {
            var evalFinished = false
            let evalTimeout = DispatchWorkItem {
                guard !evalFinished else { return }
                evalFinished = true
                completion(["ok": false, "error": "JavaScript evaluation timed out."])
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(evalTimeoutMs), execute: evalTimeout)

            let runWrapped = {
                webView.evaluateJavaScript(wrappedScript) { result, error in
                    guard !evalFinished else { return }
                    evalFinished = true
                    evalTimeout.cancel()
                    if let error = error {
                        completion(["ok": false, "error": error.localizedDescription])
                        return
                    }
                    completion(self.decodeJavaScriptResult(result))
                }
            }

            let injectAndRun = {
                if injectScrapers, scraperBundle.isEmpty {
                    guard !evalFinished else { return }
                    evalFinished = true
                    evalTimeout.cancel()
                    completion(["ok": false, "error": "Scraper bundle missing from app bundle."])
                    return
                }

                let probe = "(typeof window.mobileScrapers === 'object' && typeof window.mobileScrapers.installSearch === 'function') ? 1 : 0"
                webView.evaluateJavaScript(probe) { probeResult, _ in
                    let alreadyLoaded = (probeResult as? Int) == 1 || (probeResult as? NSNumber)?.intValue == 1
                    if alreadyLoaded || !injectScrapers {
                        runWrapped()
                        return
                    }

                    webView.evaluateJavaScript(scraperBundle + "\n1;") { _, error in
                        if let error = error,
                           !error.localizedDescription.localizedCaseInsensitiveContains("unsupported type") {
                            guard !evalFinished else { return }
                            evalFinished = true
                            evalTimeout.cancel()
                            completion(["ok": false, "error": "Scraper bundle failed: \(error.localizedDescription)"])
                            return
                        }
                        runWrapped()
                    }
                }
            }

            injectAndRun()
        }

        func scrapeHasContent(_ dict: [String: Any]) -> Bool {
            if let movies = dict["movies"] as? [Any], !movies.isEmpty {
                return true
            }
            if let detail = dict["detail"] as? [String: Any] {
                if detail["ok"] as? Bool == true, detail["movie"] != nil {
                    return true
                }
            }
            if let seasons = dict["seasons"] as? [Any], !seasons.isEmpty {
                return true
            }
            if dict["ok"] as? Bool == true, dict["episodes"] != nil {
                return true
            }
            if let links = dict["links"] as? [Any], !links.isEmpty {
                return true
            }
            return false
        }

        func isPending(_ result: Any?) -> Bool {
            guard let dict = result as? [String: Any] else { return false }
            if dict["pending"] as? Bool == true { return true }
            return (dict["pending"] as? NSNumber)?.boolValue == true
        }

        func runScrapePass(retrying: Bool) {
            let delayMs = retrying ? min(retryWaitMs, 1500) : waitMs
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(delayMs)) {
                guard sessionId == self.scrapeSessionId, !self.scrapeResolved else { return }
                evaluateOnce { result in
                    guard !self.scrapeResolved else { return }
                    if isPending(result) {
                        runScrapePass(retrying: true)
                        return
                    }
                    if let dict = result as? [String: Any] {
                        let err = String(dict["error"] as? String ?? "")
                        if err.localizedCaseInsensitiveContains("timed out") {
                            runScrapePass(retrying: true)
                            return
                        }
                    }

                    if retrying {
                        safeFinish(with: result)
                        return
                    }

                    if let dict = result as? [String: Any], scrapeHasContent(dict) {
                        safeFinish(with: result)
                        return
                    }

                    runScrapePass(retrying: true)
                }
            }
        }

        func startScrapeAfterLogin() {
            guard sessionId == self.scrapeSessionId, !self.scrapeResolved, !scrapePassStarted else { return }
            scrapePassStarted = true
            navTimeoutWorkItem?.cancel()
            self.loginOnCurrentPage(webView) {
                guard sessionId == self.scrapeSessionId, !self.scrapeResolved else { return }
                self.copyWebViewCookiesToStorage(for: url) {
                    guard sessionId == self.scrapeSessionId, !self.scrapeResolved else { return }
                    self.waitForJQuery(webView, attempts: 10) { _ in
                        guard sessionId == self.scrapeSessionId, !self.scrapeResolved else { return }
                        runScrapePass(retrying: false)
                    }
                }
            }
        }

        let delegate = ScrapeNavigationDelegate(
            shouldReady: { self.scrapePageMatches($0, target: url) },
            onReady: {
                guard self.scrapePageMatches(webView, target: url) else { return }
                startScrapeAfterLogin()
            },
            onProcessTerminated: {
                guard sessionId == self.scrapeSessionId, !self.scrapeResolved else { return }
                navTimeoutWorkItem?.cancel()
                overallTimeoutWorkItem?.cancel()
                safeFinish(with: ["ok": false, "error": "Web content process crashed during scrape."])
            },
            onDownloadLink: { link in
                if !self.capturedDownloadLinks.contains(link) {
                    self.capturedDownloadLinks.append(link)
                }
            },
            onLoadFailed: { error in
                guard sessionId == self.scrapeSessionId, !self.scrapeResolved else { return }
                if self.scrapeLoadRetries < 1 {
                    self.scrapeLoadRetries += 1
                    webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45))
                    return
                }
                safeFinish(with: [
                    "ok": false,
                    "error": "Could not open the movie page (network \(error.code))."
                ])
            }
        )

        self.scrapeDelegate = delegate
        webView.navigationDelegate = delegate
        attachScrapeWebView(webView)

        navTimeoutWorkItem = DispatchWorkItem {
            guard !self.scrapeResolved else { return }
            if self.scrapePageMatches(webView, target: url) {
                startScrapeAfterLogin()
                return
            }
            let href = webView.url?.absoluteString ?? "no-url"
            safeFinish(with: [
                "ok": false,
                "error": "Movie page did not load (\(href)).",
                "links": []
            ])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: navTimeoutWorkItem!)

        overallTimeoutWorkItem = DispatchWorkItem {
            safeFinish(with: ["ok": false, "error": "Scrape timed out waiting for page content."])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(overallTimeoutMs), execute: overallTimeoutWorkItem!)

        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45))
    }

    private func scrapePageMatches(_ webView: WKWebView, target: URL) -> Bool {
        guard let current = webView.url,
              let scheme = current.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = current.host,
              let targetHost = target.host else {
            return false
        }
        let currentHost = host.lowercased()
        let expectedHost = targetHost.lowercased()
        let hostOk = currentHost == expectedHost
            || currentHost.hasSuffix(".\(expectedHost)")
            || expectedHost.hasSuffix(".\(currentHost)")
        guard hostOk else { return false }

        let currentPath = current.path.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let targetPath = target.path.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !currentPath.isEmpty, !targetPath.isEmpty else { return false }

        if currentPath == targetPath
            || currentPath.hasPrefix(targetPath + "/")
            || targetPath.hasPrefix(currentPath + "/") {
            return true
        }
        if let id = extractContentId(from: target)?.lowercased(), !id.isEmpty, currentPath.contains(id) {
            return true
        }
        return currentPath.contains("search") && targetPath.contains("search")
    }

    private func waitForJQuery(_ webView: WKWebView, attempts: Int, completion: @escaping (Bool) -> Void) {
        let script = """
        (function() {
          var jq = typeof window.jQuery === "function" || typeof window.$ === "function";
          var ready = document.readyState === "complete" || document.readyState === "interactive";
          return (jq && ready) ? 1 : 0;
        })()
        """
        webView.evaluateJavaScript(script) { result, _ in
            DispatchQueue.main.async {
                let ready = (result as? NSNumber)?.intValue == 1 || (result as? Int) == 1
                if ready || attempts <= 0 {
                    completion(ready)
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.waitForJQuery(webView, attempts: attempts - 1, completion: completion)
                }
            }
        }
    }

    private func mergeCapturedLinks(_ decoded: Any) -> Any {
        guard var dict = decoded as? [String: Any] else { return decoded }
        var links = dict["links"] as? [String] ?? []
        for url in capturedDownloadLinks where !links.contains(url) {
            links.append(url)
        }
        dict["links"] = links
        if !links.isEmpty {
            dict["ok"] = true
            dict["error"] = NSNull()
        }
        return dict
    }

    private func loginOnCurrentPage(_ webView: WKWebView, completion: @escaping () -> Void) {
        guard let host = webView.url?.host?.lowercased(), host.contains("tornadomovies") else {
            completion()
            return
        }
        guard let username = siteLoginUser, let password = siteLoginPassword,
              !username.isEmpty, !password.isEmpty else {
            completion()
            return
        }

        let userJson = jsEncode(username)
        let passJson = jsEncode(password)
        let script = """
        (function() {
          if (document.querySelector('a[href*="logout"], a[href*="signout"], a[href*="sign-out"]')) {
            window.__tornadoLoginStarted = true;
            window.__tornadoLoginDone = true;
            window.__tornadoLoginOk = true;
            return true;
          }
          var csrfParam = document.querySelector('meta[name="csrf-param"]');
          var csrfToken = document.querySelector('meta[name="csrf-token"]');
          var param = csrfParam && csrfParam.getAttribute("content");
          var token = csrfToken && csrfToken.getAttribute("content");
          if (!window.fetch) return false;
          var body = new URLSearchParams();
          var recaptcha = "";
          try {
            if (typeof grecaptcha !== "undefined" && typeof grecaptcha.getResponse === "function") {
              recaptcha = grecaptcha.getResponse() || "";
            }
          } catch (e) {}
          body.set("SignupForm[email]", \(userJson));
          body.set("SignupForm[password]", \(passJson));
          body.set("SignupForm[rememberMe]", "1");
          if (recaptcha) body.set("SignupForm[reCaptcha]", recaptcha);
          body.set("notification", "false");
          if (param && token) body.set(param, token);
          window.__tornadoLoginStarted = true;
          window.__tornadoLoginDone = false;
          window.__tornadoLoginOk = false;
          window.__tornadoLoginMsg = "";
          fetch("/user/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              "X-CSRF-Token": token || ""
            },
            body: body.toString()
          }).then(function(response) { return response.text(); }).then(function(text) {
            window.__tornadoLoginDone = true;
            try {
              var parsed = JSON.parse(text);
              window.__tornadoLoginOk = parsed.response === true;
              var rawMsg = parsed.msg || parsed.error || parsed.message || "";
              window.__tornadoLoginMsg = /verification code/i.test(rawMsg)
                ? "Tornado blocked sign-in with its captcha check. This is not a code you type here. Try Sign In & Save again."
                : rawMsg;
            } catch (e) {
              window.__tornadoLoginOk = /logout/i.test(text);
              window.__tornadoLoginMsg = "";
            }
          }).catch(function() {
            window.__tornadoLoginDone = true;
            window.__tornadoLoginOk = false;
            window.__tornadoLoginMsg = "Could not reach Tornado to sign in.";
          });
          return true;
        })()
        """

        webView.evaluateJavaScript(script) { _, _ in
            self.waitForTornadoLogin(webView, attempts: 12, completion: completion)
        }
    }

    private func waitForTornadoLogin(_ webView: WKWebView, attempts: Int, completion: @escaping () -> Void) {
        let script = """
        (function() {
          if (window.__tornadoLoginDone) return 1;
          if (!window.__tornadoLoginStarted) return 1;
          return 0;
        })()
        """
        webView.evaluateJavaScript(script) { result, _ in
            DispatchQueue.main.async {
                let done = (result as? NSNumber)?.intValue == 1
                    || (result as? Int) == 1
                    || (result as? Bool) == true
                if done || attempts <= 0 {
                    completion()
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    self.waitForTornadoLogin(webView, attempts: attempts - 1, completion: completion)
                }
            }
        }
    }

    private func copyWebViewCookiesToStorage(for url: URL, completion: @escaping () -> Void) {
        let host = url.host ?? "www4.tornadomovies.co"
        let apply = {
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                for cookie in cookies where self.cookieMatches(cookie, host: host) {
                    HTTPCookieStorage.shared.setCookie(cookie)
                }
                DispatchQueue.main.async(execute: completion)
            }
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    private func jsEncode(_ value: String) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let text = String(data: data, encoding: .utf8) else {
            return "\"\""
        }
        return text
    }

    private func extractContentId(from url: URL) -> String? {
        let parts = url.path.split(separator: "/").map(String.init)
        if let index = parts.firstIndex(where: { $0.lowercased() == "movie" }), index + 2 < parts.count {
            return parts[index + 2]
        }
        let tvKeys: Set<String> = ["tv-series", "tv", "serie", "series"]
        if let index = parts.firstIndex(where: { tvKeys.contains($0.lowercased()) }), index + 2 < parts.count {
            return parts[index + 2]
        }
        return nil
    }

    private func extractWatchingId(from url: URL) -> String? {
        let path = url.path
        guard let regex = try? NSRegularExpression(
            pattern: #"([A-Za-z0-9]+)-watching\.html?"#,
            options: .caseInsensitive
        ) else { return nil }
        let ns = path as NSString
        guard let match = regex.firstMatch(in: path, range: NSRange(location: 0, length: ns.length)),
              match.numberOfRanges > 1 else { return nil }
        return ns.substring(with: match.range(at: 1))
    }

    private func collectDownloadIds(from html: String, pageURL: URL, extras: [String]) -> [String] {
        var ids: [String] = []
        var seen = Set<String>()
        func add(_ raw: String?) {
            let id = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty else { return }
            guard !["season", "episode", "watch", "movie"].contains(id.lowercased()) else { return }
            if seen.insert(id).inserted {
                ids.append(id)
            }
        }

        add(extractWatchingId(from: pageURL))

        let catalogId = extractContentId(from: pageURL)
        var patterns: [String] = [
            #"play_button[^>]*data-id=["']([A-Za-z0-9]+)["']"#,
            #"data-id=["']([A-Za-z0-9]+)["'][^>]*play_button"#
        ]
        if let catalogId, !catalogId.isEmpty {
            let escaped = NSRegularExpression.escapedPattern(for: catalogId)
            patterns.insert("/\(escaped)/([A-Za-z0-9]+)-watching\\.html?", at: 0)
        } else {
            patterns.insert(#"([A-Za-z0-9]+)-watching\.html?"#, at: 0)
        }
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { continue }
            let ns = html as NSString
            let matches = regex.matches(in: html, range: NSRange(location: 0, length: ns.length))
            for match in matches where match.numberOfRanges > 1 {
                add(ns.substring(with: match.range(at: 1)))
            }
        }

        for extra in extras { add(extra) }
        add(extractContentId(from: pageURL))
        return ids
    }

    private func getbuttonLooksLoggedOut(_ html: String) -> Bool {
        if htmlLooksLoggedIn(html) { return false }
        let lower = html.lowercased()
        return htmlLooksLikeLoginWall(html)
            || lower.contains("premiummembership")
            || lower.contains("get premium")
    }

    private func collectLoadshareLinks(from text: String) -> [String] {
        let cleaned = text
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "\\/", with: "/")
            .replacingOccurrences(of: "\\u002f", with: "/", options: .caseInsensitive)
        guard let regex = try? NSRegularExpression(
            pattern: #"(?:https?:)?//[^\s"'<>\\]*loadshare\.org/download/[^\s"'<>\\]+"#,
            options: [.caseInsensitive]
        ) else { return [] }

        let ns = cleaned as NSString
        let matches = regex.matches(in: cleaned, range: NSRange(location: 0, length: ns.length))
        var links: [String] = []
        var seen = Set<String>()
        for match in matches {
            var url = ns.substring(with: match.range)
            url = url.trimmingCharacters(in: CharacterSet(charactersIn: "\"')>,"))
            if url.hasPrefix("//") {
                url = "https:" + url
            }
            if seen.insert(url).inserted {
                links.append(url)
            }
        }
        return links
    }

    private func extractDownloadClickURL(from html: String, base: URL) -> URL? {
        let cleaned = html.replacingOccurrences(of: "&amp;", with: "&")
        let patterns = [
            #"id=["']click_to_download["'][^>]*href=["']([^"']+)"#,
            #"href=["']([^"']+)["'][^>]*id=["']click_to_download["']"#,
            #"id=["']click_to_download["'][^>]*data-href=["']([^"']+)"#,
            #"window\.open\(['"](https?:[^'"]*loadshare\.org/download/[^'"]+)['"]"#
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { continue }
            let ns = cleaned as NSString
            guard let match = regex.firstMatch(in: cleaned, range: NSRange(location: 0, length: ns.length)),
                  match.numberOfRanges > 1 else { continue }
            let raw = ns.substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty || raw == "#" { continue }
            return URL(string: raw, relativeTo: base)?.absoluteURL
        }
        return nil
    }

    private func followDownloadClick(_ url: URL, cookieHeader: String?, referer: URL, completion: @escaping ([String]) -> Void) {
        if url.absoluteString.range(of: "loadshare.org/download/", options: .caseInsensitive) != nil {
            completion([url.absoluteString])
            return
        }

        let catcher = RedirectCatcher()
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 10
        let session = URLSession(configuration: config, delegate: catcher, delegateQueue: nil)
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        applySiteHeaders(&request, referer: referer, ajax: false)
        if let cookieHeader {
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        }

        let task = session.dataTask(with: request) { data, response, _ in
            var links: [String] = []
            if let captured = catcher.captured {
                links.append(captured.absoluteString)
            }
            if let final = response?.url?.absoluteString,
               final.range(of: "loadshare.org/download/", options: .caseInsensitive) != nil {
                links.append(final)
            }
            if let data, let text = String(data: data, encoding: .utf8) {
                links.append(contentsOf: self.collectLoadshareLinks(from: text))
            }
            session.invalidateAndCancel()
            completion(links)
        }
        task.resume()
    }

    private func cookieMatches(_ cookie: HTTPCookie, host: String) -> Bool {
        let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
        return host == cookie.domain
            || host == domain
            || host.hasSuffix(".\(domain)")
            || domain.hasSuffix(host)
    }

    private func cookieHeader(for url: URL, cookies: [HTTPCookie]) -> String? {
        let host = url.host ?? ""
        let matched = cookies.filter { cookieMatches($0, host: host) }
        guard !matched.isEmpty else { return nil }
        return HTTPCookie.requestHeaderFields(with: matched)["Cookie"]
    }

    private func applySiteHeaders(_ request: inout URLRequest, referer: URL?, ajax: Bool) {
        request.setValue(desktopUserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue(
            ajax ? "*/*; q=0.01" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            forHTTPHeaderField: "Accept"
        )
        request.setValue(siteOrigin, forHTTPHeaderField: "Origin")
        if ajax {
            request.setValue("XMLHttpRequest", forHTTPHeaderField: "X-Requested-With")
        }
        if let referer {
            request.setValue(referer.absoluteString, forHTTPHeaderField: "Referer")
        } else {
            request.setValue("\(siteOrigin)/tornado-1", forHTTPHeaderField: "Referer")
        }
    }

    private func parseCsrf(from html: String) -> (param: String, token: String)? {
        func metaContent(named name: String) -> String? {
            let pattern = "name=\"\(name)\"[^>]*content=\"([^\"]+)\""
            let alt = "content=\"([^\"]+)\"[^>]*name=\"\(name)\""
            for candidate in [pattern, alt] {
                guard let regex = try? NSRegularExpression(pattern: candidate, options: .caseInsensitive) else { continue }
                let ns = html as NSString
                guard let match = regex.firstMatch(in: html, range: NSRange(location: 0, length: ns.length)),
                      match.numberOfRanges > 1 else { continue }
                return ns.substring(with: match.range(at: 1))
            }
            return nil
        }
        guard let param = metaContent(named: "csrf-param"),
              let token = metaContent(named: "csrf-token"),
              !param.isEmpty,
              !token.isEmpty else { return nil }
        return (param, token)
    }

    private func htmlLooksLoggedIn(_ html: String) -> Bool {
        let lower = html.lowercased()
        return lower.contains("/user/logout")
            || lower.contains("href=\"/logout")
            || lower.contains("sign out")
            || lower.contains(">logout<")
    }

    private func htmlLooksLikeLoginWall(_ html: String) -> Bool {
        let lower = html.lowercased()
        return lower.contains("id=\"login-form\"")
            || lower.contains("signupform[email]")
            || lower.contains("please login")
            || lower.contains("sign in to download")
    }

    private func copyCookiesToWebView(_ cookies: [HTTPCookie], completion: @escaping () -> Void) {
        let apply = {
            let store = WKWebsiteDataStore.default().httpCookieStore
            let group = DispatchGroup()
            for cookie in cookies {
                HTTPCookieStorage.shared.setCookie(cookie)
                group.enter()
                store.setCookie(cookie) {
                    group.leave()
                }
            }
            group.notify(queue: .main, execute: completion)
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    private func readSiteCookies(for url: URL, completion: @escaping ([HTTPCookie]) -> Void) {
        let read = {
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { wkCookies in
                let host = url.host ?? "www4.tornadomovies.co"
                var merged: [String: HTTPCookie] = [:]
                for cookie in (HTTPCookieStorage.shared.cookies ?? []) where self.cookieMatches(cookie, host: host) {
                    merged["\(cookie.name)|\(cookie.domain)"] = cookie
                }
                for cookie in wkCookies where self.cookieMatches(cookie, host: host) {
                    merged["\(cookie.name)|\(cookie.domain)"] = cookie
                }
                completion(Array(merged.values))
            }
        }
        if Thread.isMainThread {
            read()
        } else {
            DispatchQueue.main.async(execute: read)
        }
    }

    private func siteCookiesFromStorage(for url: URL) -> [HTTPCookie] {
        let host = url.host ?? "www4.tornadomovies.co"
        return (HTTPCookieStorage.shared.cookies ?? []).filter { cookieMatches($0, host: host) }
    }

    @objc func openSiteLogin(_ call: CAPPluginCall) {
        let username = call.getString("username")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = call.getString("password") ?? ""
        if !username.isEmpty, !password.isEmpty {
            siteLoginUser = username
            siteLoginPassword = password
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.resolve(["ok": false, "error": "Could not open the Tornado login page."])
                return
            }
            if presenter.presentedViewController != nil {
                call.resolve(["ok": false, "error": "Close the current screen, then try Sign In again."])
                return
            }

            let config = WKWebViewConfiguration()
            config.processPool = Self.scrapeProcessPool
            config.websiteDataStore = WKWebsiteDataStore.default()
            config.defaultWebpagePreferences.allowsContentJavaScript = true
            config.preferences.javaScriptCanOpenWindowsAutomatically = true
            config.allowsInlineMediaPlayback = false
            config.userContentController.addUserScript(
                WKUserScript(source: loginPageHelperScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )

            let webView = WKWebView(frame: .zero, configuration: config)
            webView.isOpaque = true
            webView.isUserInteractionEnabled = true
            self.loginWebView = webView

            let loginPage = URL(string: "\(siteOrigin)/tornado-1")!
            let controller = SiteLoginViewController(webView: webView, username: username, password: password)
            controller.onFinished = { [weak self] success in
                guard let self else { return }
                self.loginPresenter = nil
                self.loginWebView?.navigationDelegate = nil
                self.loginWebView?.uiDelegate = nil
                self.loginWebView = nil
                if success {
                    self.siteLoginAt = Date()
                    self.copyWebViewCookiesToStorage(for: loginPage) {
                        call.resolve(["ok": true, "status": "logged-in"])
                    }
                } else {
                    call.resolve([
                        "ok": false,
                        "error": "Sign-in cancelled. Open Tornado, complete the captcha, then sign in."
                    ])
                }
            }

            let nav = UINavigationController(rootViewController: controller)
            nav.modalPresentationStyle = .fullScreen
            self.loginPresenter = nav
            presenter.present(nav, animated: true) {
                webView.load(URLRequest(url: loginPage, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45))
            }
        }
    }

    @objc func rememberSiteCredentials(_ call: CAPPluginCall) {
        let username = call.getString("username")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = call.getString("password") ?? ""
        guard !username.isEmpty, !password.isEmpty else {
            call.resolve(["ok": false, "error": "Missing username or password."])
            return
        }
        siteLoginUser = username
        siteLoginPassword = password
        call.resolve(["ok": true, "status": "stored"])
    }

    @objc func siteLogin(_ call: CAPPluginCall) {
        let username = call.getString("username")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = call.getString("password") ?? ""
        guard !username.isEmpty, !password.isEmpty else {
            call.resolve(["ok": false, "error": "Missing username or password."])
            return
        }
        siteLoginUser = username
        siteLoginPassword = password
        performSiteLogin(username: username, password: password) { payload in
            DispatchQueue.main.async {
                call.resolve(payload)
            }
        }
    }

    private func ensureSiteSession(username: String, password: String, completion: @escaping ([String: Any]) -> Void) {
        if let at = siteLoginAt,
           Date().timeIntervalSince(at) < 25 * 60,
           siteLoginUser == username {
            completion(["ok": true, "status": "cached"])
            return
        }
        performSiteLogin(username: username, password: password, completion: completion)
    }

    private func formURLEncoded(_ fields: [(String, String)]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._*")
        func encode(_ value: String) -> String {
            value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
        }
        return fields
            .map { "\(encode($0.0))=\(encode($0.1))" }
            .joined(separator: "&")
            .data(using: .utf8) ?? Data()
    }

    private func performSiteLogin(username: String, password: String, completion: @escaping ([String: Any]) -> Void) {
        guard let loginURL = URL(string: "\(siteOrigin)/user/login"),
              let homeURL = URL(string: "\(siteOrigin)/tornado-1") else {
            completion(["ok": false, "error": "Invalid site URL."])
            return
        }

        var loginPageRequest = URLRequest(url: loginURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        applySiteHeaders(&loginPageRequest, referer: homeURL, ajax: true)

        siteSession.dataTask(with: loginPageRequest) { data, _, error in
            if let error {
                completion(["ok": false, "error": error.localizedDescription])
                return
            }
            let html = String(data: data ?? Data(), encoding: .utf8) ?? ""
            if self.htmlLooksLoggedIn(html) {
                self.siteLoginAt = Date()
                self.copyCookiesToWebView(self.siteCookiesFromStorage(for: homeURL)) {
                    completion(["ok": true, "status": "already-logged-in"])
                }
                return
            }

            guard let csrf = self.parseCsrf(from: html) else {
                completion(["ok": false, "error": "Could not read the site login token. Try again."])
                return
            }

            let body = self.formURLEncoded([
                ("SignupForm[email]", username),
                ("SignupForm[password]", password),
                ("SignupForm[rememberMe]", "1"),
                ("SignupForm[reCaptcha]", ""),
                ("notification", "false"),
                (csrf.param, csrf.token)
            ])

            var loginRequest = URLRequest(url: loginURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
            loginRequest.httpMethod = "POST"
            self.applySiteHeaders(&loginRequest, referer: loginURL, ajax: true)
            loginRequest.setValue("application/x-www-form-urlencoded; charset=UTF-8", forHTTPHeaderField: "Content-Type")
            loginRequest.setValue(csrf.token, forHTTPHeaderField: "X-CSRF-Token")
            if let cookies = self.cookieHeader(for: loginURL, cookies: self.siteCookiesFromStorage(for: loginURL)) {
                loginRequest.setValue(cookies, forHTTPHeaderField: "Cookie")
            }
            loginRequest.httpBody = body

            self.siteSession.dataTask(with: loginRequest) { loginData, response, loginError in
                if let loginError {
                    completion(["ok": false, "error": loginError.localizedDescription])
                    return
                }
                let http = response as? HTTPURLResponse
                let text = String(data: loginData ?? Data(), encoding: .utf8) ?? ""
                var json: [String: Any] = [:]
                if let loginData,
                   let obj = try? JSONSerialization.jsonObject(with: loginData) as? [String: Any] {
                    json = obj
                }

                let accepted = json["response"] as? Bool == true
                    || (json["response"] as? NSNumber)?.boolValue == true
                    || self.htmlLooksLoggedIn(text)
                if !accepted {
                    let message = (json["msg"] as? String)
                        ?? (json["error"] as? String)
                        ?? (http.map { "Login failed (HTTP \($0.statusCode))." } ?? "Login failed.")
                    completion(["ok": false, "error": message, "status": "rejected"])
                    return
                }

                self.siteLoginAt = Date()
                self.copyCookiesToWebView(self.siteCookiesFromStorage(for: homeURL)) {
                    completion(["ok": true, "status": "logged-in"])
                }
            }.resume()
        }.resume()
    }

    @objc func fetchDirectLinks(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let pageURL = URL(string: urlString) else {
            call.reject("Missing url")
            return
        }

        var extraIds: [String] = []
        if let arr = call.getArray("movieIds") {
            extraIds.append(contentsOf: arr.compactMap { value in
                if let text = value as? String { return text }
                if let number = value as? NSNumber { return number.stringValue }
                return nil
            })
        }
        if let movieId = call.getString("movieId") {
            extraIds.append(movieId)
        }

        let username = call.getString("username")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let password = call.getString("password") ?? ""
        let origin = "\(pageURL.scheme ?? "https")://\(pageURL.host ?? "www4.tornadomovies.co")"

        final class FetchState {
            var finished = false
            var discoveredIds: [String] = []
        }
        let state = FetchState()
        state.discoveredIds = extraIds

        func finish(links: [String], error: String?, loggedOut: Bool = false) {
            DispatchQueue.main.async {
                guard !state.finished else { return }
                state.finished = true
                let unique = Array(Set(links))
                call.resolve([
                    "ok": !unique.isEmpty,
                    "links": unique,
                    "movieId": state.discoveredIds.first ?? extraIds.first ?? "",
                    "movieIds": state.discoveredIds,
                    "loggedOut": loggedOut,
                    "error": unique.isEmpty ? (error ?? "No direct download link found.") : NSNull()
                ])
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 22) {
            finish(links: [], error: "Link fetch timed out.")
        }

        func requestText(_ apiURL: URL, cookieHeader: String?, ajax: Bool, completion: @escaping (String, Int, Error?) -> Void) {
            var request = URLRequest(url: apiURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
            request.httpMethod = "GET"
            self.applySiteHeaders(&request, referer: pageURL, ajax: ajax)
            if let cookieHeader {
                request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
            }
            self.siteSession.dataTask(with: request) { data, response, error in
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                let text = String(data: data ?? Data(), encoding: .utf8) ?? ""
                completion(text, status, error)
            }.resume()
        }

        func tryId(_ id: String, cookieHeader: String?, completion: @escaping ([String], String?) -> Void) {
            guard let buttonURL = URL(string: "\(origin)/getbutton/\(id)/true"),
                  let downloadURL = URL(string: "\(origin)/getdownload/\(id)/true") else {
                completion([], "Invalid getbutton URL.")
                return
            }
            let group = DispatchGroup()
            var buttonHtml = ""
            var downloadText = ""
            var buttonStatus = 0
            var firstError: String?

            group.enter()
            requestText(buttonURL, cookieHeader: cookieHeader, ajax: true) { text, status, error in
                buttonHtml = text
                buttonStatus = status
                if let error { firstError = error.localizedDescription }
                group.leave()
            }
            group.enter()
            requestText(downloadURL, cookieHeader: cookieHeader, ajax: true) { text, _, error in
                downloadText = text
                if firstError == nil, let error { firstError = error.localizedDescription }
                group.leave()
            }

            group.notify(queue: .global()) {
                var links = self.collectLoadshareLinks(from: buttonHtml)
                links.append(contentsOf: self.collectLoadshareLinks(from: downloadText))
                if !links.isEmpty {
                    completion(links, nil)
                    return
                }
                if buttonStatus >= 400 {
                    completion([], firstError ?? "HTTP \(buttonStatus) from getbutton")
                    return
                }
                if self.getbuttonLooksLoggedOut(buttonHtml) {
                    completion([], "logged-out")
                    return
                }
                if let clickURL = self.extractDownloadClickURL(from: buttonHtml, base: pageURL) {
                    self.followDownloadClick(clickURL, cookieHeader: cookieHeader, referer: pageURL) { followed in
                        completion(followed, followed.isEmpty ? (firstError ?? "getbutton returned no loadshare link.") : nil)
                    }
                    return
                }
                completion([], buttonHtml.isEmpty ? "getbutton returned no download button." : "getbutton returned no loadshare link.")
            }
        }

        func tryIds(_ ids: [String], cookieHeader: String?, index: Int, lastError: String?) {
            guard index < ids.count else {
                let loggedOut = lastError == "logged-out"
                finish(
                    links: [],
                    error: loggedOut
                        ? "Not signed in on Tornado. Save Site Login, then try again."
                        : (lastError ?? "No direct download link found."),
                    loggedOut: loggedOut
                )
                return
            }
            tryId(ids[index], cookieHeader: cookieHeader) { links, error in
                if !links.isEmpty {
                    finish(links: links, error: nil)
                    return
                }
                tryIds(ids, cookieHeader: cookieHeader, index: index + 1, lastError: error ?? lastError)
            }
        }

        func fetchCatalogThenButtons(cookieHeader: String?) {
            var request = URLRequest(url: pageURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
            request.httpMethod = "GET"
            self.applySiteHeaders(&request, referer: URL(string: "\(origin)/tornado-1"), ajax: false)
            if let cookieHeader {
                request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
            }
            self.siteSession.dataTask(with: request) { data, _, _ in
                let html = String(data: data ?? Data(), encoding: .utf8) ?? ""
                let ids = self.collectDownloadIds(from: html, pageURL: pageURL, extras: extraIds)
                state.discoveredIds = ids
                if ids.isEmpty {
                    finish(links: [], error: "Missing movie id in URL.")
                    return
                }
                tryIds(ids, cookieHeader: cookieHeader, index: 0, lastError: nil)
            }.resume()
        }

        func startFetch() {
            self.readSiteCookies(for: pageURL) { cookies in
                fetchCatalogThenButtons(cookieHeader: self.cookieHeader(for: pageURL, cookies: cookies))
            }
        }

        if !username.isEmpty && !password.isEmpty {
            ensureSiteSession(username: username, password: password) { _ in
                startFetch()
            }
        } else {
            startFetch()
        }
    }

    private func sanitizeDownloadFileName(_ raw: String) -> String {
        var name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { name = "download.mp4" }
        let invalid = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        name = name.components(separatedBy: invalid).joined(separator: "_")
        if !name.lowercased().hasSuffix(".mp4")
            && !name.lowercased().hasSuffix(".mkv")
            && !name.lowercased().hasSuffix(".mov")
            && !name.lowercased().hasSuffix(".m4v") {
            name += ".mp4"
        }
        return name
    }

    @objc func downloadFile(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing download url")
            return
        }

        let fileName = sanitizeDownloadFileName(call.getString("fileName") ?? "download.mp4")
        let referer = call.getString("referer")
        let folder = ensureAppDownloadsFolder()

        if activeDownload?.status["state"] as? String == "running" {
            call.resolve(["ok": false, "error": "Another download is already running."])
            return
        }

        let downloader = ActiveFileDownload()
        activeDownload = downloader
        downloader.start(url: url, destinationFolder: folder, fileName: fileName, referer: referer) { _ in
            // JS polls getDownloadStatus until finished/failed.
        }
        call.resolve(["ok": true, "started": true, "fileName": fileName])
    }

    @objc func getDownloadStatus(_ call: CAPPluginCall) {
        call.resolve(activeDownload?.status ?? ["state": "idle"])
    }

    @objc func stopDownload(_ call: CAPPluginCall) {
        activeDownload?.stop()
        activeDownload = nil
        call.resolve(["ok": true])
    }

    @objc func clearDownloadJob(_ call: CAPPluginCall) {
        activeDownload = nil
        call.resolve(["ok": true])
    }

    private func decodeJavaScriptResult(_ result: Any?) -> Any {
        if let text = result as? String {
            if let data = text.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) {
                return obj
            }
            return ["ok": false, "error": text]
        }
        if JSONSerialization.isValidJSONObject(result ?? NSNull()) {
            return result ?? ["ok": false, "error": "Scrape returned no data."]
        }
        if let number = result as? NSNumber {
            return ["ok": false, "error": "Unexpected numeric scrape result: \(number)"]
        }
        return ["ok": false, "error": "Scrape returned no data."]
    }

    private func loadBundledScraperScript() -> String {
        let candidates = [
            Bundle.main.url(forResource: "scrapers", withExtension: "js", subdirectory: "public/js"),
            Bundle.main.url(forResource: "scrapers", withExtension: "js", subdirectory: "js"),
            Bundle.main.url(forResource: "scrapers", withExtension: "js")
        ]

        for candidate in candidates.compactMap({ $0 }) {
            if let text = try? String(contentsOf: candidate, encoding: .utf8), !text.isEmpty {
                return text
            }
        }
        return ""
    }
}
