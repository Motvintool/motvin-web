/*
 * motvin-ocr — read the text on a screenshot using only what macOS already has.
 *
 *   motvin-ocr <image>
 *
 * Emits one JSON object per line:
 *   {"t":"Continue","x":0.12,"y":0.78,"w":0.76,"h":0.03}
 *
 * Coordinates are normalised 0–1 with y measured from the TOP, which is how
 * everyone reasons about a screen. Vision reports from the bottom, so it is
 * flipped here rather than in three places downstream.
 *
 * This exists so the crawler can classify screens without an API key. Apple's
 * Vision text recogniser runs on-device, costs nothing, and needs no network —
 * which makes rule-based classification possible offline. Built on demand by
 * src/ocr.js and cached in .bin/.
 */

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

/** JSON string escaping — enough for the text Vision returns. */
static NSString *Escape(NSString *text) {
  NSMutableString *out = [NSMutableString stringWithCapacity:text.length + 8];
  for (NSUInteger i = 0; i < text.length; i++) {
    unichar c = [text characterAtIndex:i];
    switch (c) {
      case '"': [out appendString:@"\\\""]; break;
      case '\\': [out appendString:@"\\\\"]; break;
      case '\n': [out appendString:@"\\n"]; break;
      case '\r': [out appendString:@"\\r"]; break;
      case '\t': [out appendString:@"\\t"]; break;
      default:
        if (c < 0x20) {
          [out appendFormat:@"\\u%04x", c];
        } else {
          [out appendFormat:@"%C", c];
        }
    }
  }
  return out;
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: motvin-ocr <image>\n");
      return 2;
    }

    NSString *path = [NSString stringWithUTF8String:argv[1]];
    NSImage *image = [[NSImage alloc] initWithContentsOfFile:path];
    if (!image) {
      fprintf(stderr, "could not read %s\n", argv[1]);
      return 1;
    }

    CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
    if (!cgImage) {
      fprintf(stderr, "could not decode %s\n", argv[1]);
      return 1;
    }

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    // Accurate rather than fast: UI type is small and often low-contrast, and
    // one screenshot's worth of text is quick either way.
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = NO;  // App names and labels are not prose.

    NSError *error = nil;
    if (![handler performRequests:@[ request ] error:&error] || error) {
      fprintf(stderr, "vision failed: %s\n", error ? error.localizedDescription.UTF8String : "unknown");
      return 1;
    }

    for (VNRecognizedTextObservation *observation in request.results) {
      VNRecognizedText *best = [[observation topCandidates:1] firstObject];
      if (!best || best.string.length == 0) continue;
      CGRect box = observation.boundingBox;
      double yFromTop = 1.0 - (box.origin.y + box.size.height);
      printf("{\"t\":\"%s\",\"x\":%.4f,\"y\":%.4f,\"w\":%.4f,\"h\":%.4f,\"c\":%.3f}\n",
             Escape(best.string).UTF8String, box.origin.x, yFromTop, box.size.width, box.size.height,
             best.confidence);
    }

    return 0;
  }
}
