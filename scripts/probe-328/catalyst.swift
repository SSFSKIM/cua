// #328's Mac Catalyst app (bundled as Catalyst328.app): one window holding a UITableView of 200 rows; its content offset
// and every scroll it saw go to the JSON file $CATALYST328_STATE on each scroll and every 100 ms; $CATALYST328_CMD is a
// command file (`<n> reset`: back to the top).
import UIKit

func now() -> Double { (Date().timeIntervalSince1970 * 10_000).rounded() / 10 }
let env = ProcessInfo.processInfo.environment
let statePath = env["CATALYST328_STATE"] ?? "/tmp/catalyst328.json"
let commandPath = env["CATALYST328_CMD"] ?? "/tmp/catalyst328.cmd"

final class Table: UITableViewController {
  var seq = 0
  var scrolls = 0
  override func viewDidLoad() {
    super.viewDidLoad()
    tableView.register(UITableViewCell.self, forCellReuseIdentifier: "c")
    tableView.accessibilityIdentifier = "catalyst.table"
    Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.command(); self?.write() }
  }
  override func tableView(_ t: UITableView, numberOfRowsInSection s: Int) -> Int { 200 }
  override func tableView(_ t: UITableView, cellForRowAt i: IndexPath) -> UITableViewCell {
    let c = t.dequeueReusableCell(withIdentifier: "c", for: i)
    c.textLabel?.text = "catalyst row \(i.row)"
    return c
  }
  override func scrollViewDidScroll(_ s: UIScrollView) { scrolls += 1; write() }
  func write() {
    let s: [String: Any] = ["t": now(), "offsets": ["table": Double(tableView.contentOffset.y + tableView.adjustedContentInset.top)], "scrolls": scrolls]
    if let d = try? JSONSerialization.data(withJSONObject: s) { try? d.write(to: URL(fileURLWithPath: statePath), options: .atomic) }
  }
  func command() {
    guard let text = try? String(contentsOfFile: commandPath, encoding: .utf8) else { return }
    let parts = text.split(separator: " ").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    guard parts.count >= 2, let n = Int(parts[0]), n > seq else { return }
    seq = n
    if parts[1] == "reset" { tableView.setContentOffset(CGPoint(x: 0, y: -tableView.adjustedContentInset.top), animated: false); scrolls = 0 }
  }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    let w = UIWindow(frame: CGRect(x: 0, y: 0, width: 560, height: 400))
    w.rootViewController = Table(style: .plain)
    w.makeKeyAndVisible()
    window = w
    return true
  }
}
