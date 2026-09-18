/*
 * motvin-frames — pull frames out of a video using only what macOS already has.
 *
 *   motvin-frames <video> <output-dir> <fps>
 *
 * ffmpeg is the obvious tool for this and the crawler prefers it when present.
 * But installing it needs Homebrew, and on a managed Mac the Homebrew prefix
 * belongs to an admin account the person running this tool is not. Rather than
 * making video ingest depend on someone else's permission, this does the same
 * job with AVFoundation, which ships with the OS, and clang, which ships with
 * the Command Line Tools that are already required.
 *
 * Built on demand by src/frames.js and cached in .bin/.
 *
 * Frames are written as frame-00001.png … so the caller can sort them by name
 * and get chronological order, matching ffmpeg's output convention exactly.
 */

#import <AVFoundation/AVFoundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>

static BOOL WritePng(CGImageRef image, NSString *path) {
  CFURLRef url = (__bridge CFURLRef)[NSURL fileURLWithPath:path];
  CGImageDestinationRef destination = CGImageDestinationCreateWithURL(url, kUTTypePNG, 1, NULL);
  if (!destination) return NO;
  CGImageDestinationAddImage(destination, image, NULL);
  BOOL ok = CGImageDestinationFinalize(destination);
  CFRelease(destination);
  return ok;
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc < 4) {
      fprintf(stderr, "usage: motvin-frames <video> <output-dir> <fps>\n");
      return 2;
    }

    NSString *videoPath = [NSString stringWithUTF8String:argv[1]];
    NSString *outputDir = [NSString stringWithUTF8String:argv[2]];
    double fps = atof(argv[3]);
    if (fps <= 0) fps = 2;

    NSURL *url = [NSURL fileURLWithPath:videoPath];
    AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];

    if ([[asset tracksWithMediaType:AVMediaTypeVideo] count] == 0) {
      fprintf(stderr, "no video track in %s\n", argv[1]);
      return 1;
    }

    double duration = CMTimeGetSeconds(asset.duration);
    if (!(duration > 0)) {
      fprintf(stderr, "could not read the duration of %s\n", argv[1]);
      return 1;
    }

    AVAssetImageGenerator *generator = [[AVAssetImageGenerator alloc] initWithAsset:asset];
    generator.appliesPreferredTrackTransform = YES;
    // A tenth of a second either way. Exact seeking forces a decode from the
    // previous keyframe for every single frame, which turns a three-minute
    // recording into a several-minute wait for no benefit — this is sampling a
    // screen recording, not cutting a film.
    generator.requestedTimeToleranceBefore = CMTimeMakeWithSeconds(0.1, 600);
    generator.requestedTimeToleranceAfter = CMTimeMakeWithSeconds(0.1, 600);

    NSFileManager *files = [NSFileManager defaultManager];
    [files createDirectoryAtPath:outputDir withIntermediateDirectories:YES attributes:nil error:NULL];

    int written = 0;
    int failed = 0;
    double step = 1.0 / fps;

    for (double t = 0; t < duration; t += step) {
      CMTime time = CMTimeMakeWithSeconds(t, 600);
      NSError *error = nil;
      CGImageRef image = [generator copyCGImageAtTime:time actualTime:NULL error:&error];
      if (!image) {
        // One unreadable frame is not worth abandoning the recording for; a
        // run of them will show up as a low frame count in the caller.
        failed++;
        continue;
      }
      NSString *name = [NSString stringWithFormat:@"frame-%05d.png", written + 1];
      BOOL ok = WritePng(image, [outputDir stringByAppendingPathComponent:name]);
      CGImageRelease(image);
      if (ok) {
        written++;
      } else {
        failed++;
      }
    }

    if (written == 0) {
      fprintf(stderr, "no frames could be read from %s\n", argv[1]);
      return 1;
    }

    fprintf(stdout, "%d\n", written);
    if (failed > 0) fprintf(stderr, "skipped %d unreadable frame(s)\n", failed);
    return 0;
  }
}
