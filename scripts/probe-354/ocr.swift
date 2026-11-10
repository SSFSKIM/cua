// Runner-only screenshot OCR, invoked after all timed text samples. Visibility evidence, not a delivery oracle.
import Foundation
import Vision
let startedAt=Date().timeIntervalSince1970*1000
var output:[String:Any]=["source":"Vision","startedAt":startedAt,"languageCorrection":false]
do {
 guard CommandLine.arguments.count==2 else {throw NSError(domain:"probe354",code:1,userInfo:[NSLocalizedDescriptionKey:"expected screenshot file path"])}
 let path=CommandLine.arguments[1]
 let request=VNRecognizeTextRequest()
 request.recognitionLevel = .accurate
 request.usesLanguageCorrection=false
 request.recognitionLanguages=["en-US"]
 try VNImageRequestHandler(url:URL(fileURLWithPath:path),options:[:]).perform([request])
 let lines=(request.results ?? []).compactMap {observation->[String:Any]? in
  guard let candidate=observation.topCandidates(1).first else{return nil}
  let r=observation.boundingBox
  return ["text":candidate.string,"confidence":candidate.confidence,"box":["x":r.origin.x,"y":r.origin.y,"width":r.width,"height":r.height]]
 }
 output["path"]=path;output["lines"]=lines;output["text"]=lines.compactMap {$0["text"] as? String}.joined(separator:"\n")
 output["classification"]="visible-text-only; offscreen prefixes/suffixes and blank Safari screenshots are not delivery loss"
}catch{output["error"]=String(describing:error)}
output["endedAt"]=Date().timeIntervalSince1970*1000
output["durationMs"]=(output["endedAt"] as! Double)-startedAt
print(String(data:try JSONSerialization.data(withJSONObject:output,options:[.sortedKeys]),encoding:.utf8)!)
