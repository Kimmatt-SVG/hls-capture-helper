import Foundation
import Capacitor
import AMSMB2
import WebKit

private final class ScrapeNavigationDelegate: NSObject, WKNavigationDelegate {
    private let onFinish: () -> Void

    init(onFinish: @escaping () -> Void) {
        self.onFinish = onFinish
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onFinish()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        onFinish()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        onFinish()
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

@objc(MovieEnginePlugin)
public class MovieEnginePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MovieEnginePlugin"
    public let jsName = "MovieEngine"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStorageSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveStorageSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocalMoviesPath", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureLocalFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectNas", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testNasWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openLocalFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scrapePage", returnType: CAPPluginReturnPromise)
    ]

    private let settingsKey = "movie_engine_storage_settings"
    private var cachedClient: AMSMB2?
    private var scrapeWebView: WKWebView?
    private var scrapeDelegate: ScrapeNavigationDelegate?

    private func defaults() -> StorageSettingsPayload {
        StorageSettingsPayload(
            localVideoFolder: "",
            localSubfolder: "Movies",
            nasHost: "",
            nasShare: "",
            nasPath: "Videos",
            nasUsername: "",
            nasPassword: ""
        )
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
        let subfolder = settings.localSubfolder.trimmingCharacters(in: .whitespacesAndNewlines)
        let folder = subfolder.isEmpty ? "Movies" : subfolder
        return documentsDirectory().appendingPathComponent(folder, isDirectory: true)
    }

    private func displayPath(for url: URL) -> String {
        "On My iPhone > Movie Stream Downloader > \(url.lastPathComponent)"
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

    @objc func saveStorageSettings(_ call: CAPPluginCall) {
        var settings = loadSettings()
        if let value = call.getString("localSubfolder") { settings.localSubfolder = value }
        if let value = call.getString("nasHost") { settings.nasHost = value }
        if let value = call.getString("nasShare") { settings.nasShare = value }
        if let value = call.getString("nasPath") { settings.nasPath = value }
        if let value = call.getString("nasUsername") { settings.nasUsername = value }
        if let value = call.getString("nasPassword") { settings.nasPassword = value }
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
        var settings = loadSettings()
        if let subfolder = call.getString("subfolder"), !subfolder.isEmpty {
            settings.localSubfolder = subfolder
            saveSettings(settings)
        }
        let url = localMoviesURL(settings: settings)
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            call.resolve([
                "ok": true,
                "path": url.path,
                "displayPath": displayPath(for: url)
            ])
        } catch {
            call.reject("Could not create local folder.", nil, error)
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

    private func smbClient(settings: StorageSettingsPayload, completion: @escaping (Result<AMSMB2, Error>) -> Void) {
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
    }

    private func normalizedRemotePath(_ raw: String) -> String {
        raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    @objc func connectNas(_ call: CAPPluginCall) {
        var settings = loadSettings()
        if let value = call.getString("host") { settings.nasHost = value }
        if let value = call.getString("share") { settings.nasShare = value }
        if let value = call.getString("path") { settings.nasPath = value }
        if let value = call.getString("username") { settings.nasUsername = value }
        if let value = call.getString("password") { settings.nasPassword = value }
        saveSettings(settings)

        smbClient(settings: settings) { result in
            switch result {
            case .failure(let error):
                call.resolve(["ok": false, "error": error.localizedDescription])
            case .success:
                call.resolve([
                    "ok": true,
                    "path": self.buildNasDisplayPath(settings: settings)
                ])
            }
        }
    }

    @objc func testNasWrite(_ call: CAPPluginCall) {
        var settings = loadSettings()
        if let value = call.getString("host") { settings.nasHost = value }
        if let value = call.getString("share") { settings.nasShare = value }
        if let value = call.getString("path") { settings.nasPath = value }
        if let value = call.getString("username") { settings.nasUsername = value }
        if let value = call.getString("password") { settings.nasPassword = value }
        saveSettings(settings)

        smbClient(settings: settings) { result in
            switch result {
            case .failure(let error):
                call.resolve(["ok": false, "error": error.localizedDescription])
            case .success(let client):
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
                        call.resolve(["ok": true])
                    }
                }
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

        let script = call.getString("script") ?? "null"
        let waitMs = max(call.getInt("waitMs") ?? 2200, 500)

        DispatchQueue.main.async {
            let config = WKWebViewConfiguration()
            config.defaultWebpagePreferences.allowsContentJavaScript = true
            let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 800), configuration: config)
            webView.isHidden = true
            webView.customUserAgent =
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            self.scrapeWebView = webView

            if let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow }) {
                window.addSubview(webView)
            }

            let delegate = ScrapeNavigationDelegate { [weak self] in
                DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(waitMs)) {
                    webView.evaluateJavaScript(script) { result, error in
                        webView.removeFromSuperview()
                        self?.scrapeWebView = nil
                        self?.scrapeDelegate = nil

                        if let error = error {
                            call.reject(error.localizedDescription)
                            return
                        }

                        if JSONSerialization.isValidJSONObject(result ?? NSNull()) {
                            call.resolve(["ok": true, "result": result ?? NSNull()])
                        } else if let result = result {
                            call.resolve(["ok": true, "result": ["value": "\(result)"]])
                        } else {
                            call.resolve(["ok": true, "result": NSNull()])
                        }
                    }
                }
            }

            self.scrapeDelegate = delegate
            webView.navigationDelegate = delegate
            webView.load(URLRequest(url: url))
        }
    }
}
