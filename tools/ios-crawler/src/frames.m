/*
 * motvin-frames — pull frames out of a video using only what macOS already has.
 *
 *   motvin-frames <video> <output-dir> <fps> [thumb-width thumb-height]
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
 * Two files per frame:
 *
 *   frame-00001.png   the full frame, for the library
 *   frame-00001.rgb   a tiny RGB thumbnail (default 32×64, 8-bit, no header)
 *
 * The thumbnail is what the segmenter reads. Every decision about whether the
 * UI held still, scrolled, opened a sheet or flashed a loading state is made
 * on a few thousand pixels, so producing them here — while the decoded frame
 * is already in memory — is what keeps a three-minute recording from taking
 * minutes to analyse. Drawn with area-averaging, so a flat splash and a busy
 * feed both reduce honestly.
 *
 * Frames are numbered from 1 so the caller can sort them by name and get
 * chronological order, matching ffmpeg's output convention exactly.
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

/** Draws the frame into a small RGB bitmap and writes the raw bytes. */
static BOOL WriteThumb(CGImageRef image, NSString *path, int width, int height) {
  size_t bytesPerRow = (size_t)width * 4;
  unsigned char *pixels = calloc(bytesPerRow * height, 1);
  if (!pixels) return NO;

  CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(
      pixels, width, height, 8, bytesPerRow, space,
      kCGImageAlphaNoneSkipLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(space);
  if (!context) {
    free(pixels);
    return NO;
  }

  CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), image);
  CGContextRelease(context);

  // Pack to RGB, top row first — CoreGraphics draws bottom-up.
  NSMutableData *out = [NSMutableData dataWithLength:(NSUInteger)width * height * 3];
  unsigned char *dst = out.mutableBytes;
  for (int y = 0; y < height; y++) {
    const unsigned char *row = pixels + (size_t)(height - 1 - y) * bytesPerRow;
    for (int x = 0; x < width; x++) {
      *dst++ = row[x * 4];
      *dst++ = row[x * 4 + 1];
      *dst++ = row[x * 4 + 2];
    }
  }
  free(pixels);
  return [out writeToFile:path atomically:YES];
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc < 4) {
      fprintf(stderr, "usage: motvin-frames <video> <output-dir> <fps> [thumb-width thumb-height]\n");
      return 2;
    }

    NSString *videoPath = [NSString stringWithUTF8String:argv[1]];
    NSString *outputDir = [NSString stringWithUTF8String:argv[2]];
    double fps = atof(argv[3]);
    if (fps <= 0) fps = 2;
    int thumbWidth = argc > 5 ? atoi(argv[4]) : 32;
    int thumbHeight = argc > 5 ? atoi(argv[5]) : 64;
    if (thumbWidth <= 0 || thumbHeight <= 0) {
      thumbWidth = 32;
      thumbHeight = 64;
    }

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
    // A little under half a sampling step either way. Exact seeking forces a
    // decode from the previous keyframe for every single frame, which turns a
    // three-minute recording into a several-minute wait for no benefit — this
    // is sampling a screen recording, not cutting a film. The tolerance is tied
    // to the rate so that two requested frames can never resolve to the same
    // decoded one.
    double tolerance = fmin(0.1, 0.4 / fps);
    generator.requestedTimeToleranceBefore = CMTimeMakeWithSeconds(tolerance, 600);
    generator.requestedTimeToleranceAfter = CMTimeMakeWithSeconds(tolerance, 600);

    NSFileManager *files = [NSFileManager defaultManager];
    [files createDirectoryAtPath:outputDir withIntermediateDirectories:YES attributes:nil error:NULL];

    int written = 0;
    int failed = 0;
    double step = 1.0 / fps;

    for (double t = 0; t < duration; t += step) {
      @autoreleasepool {
        CMTime time = CMTimeMakeWithSeconds(t, 600);
        NSError *error = nil;
        CGImageRef image = [generator copyCGImageAtTime:time actualTime:NULL error:&error];
        if (!image) {
          // One unreadable frame is not worth abandoning the recording for; a
          // run of them will show up as a low frame count in the caller.
          failed++;
          continue;
        }
        NSString *name = [NSString stringWithFormat:@"frame-%05d", written + 1];
        NSString *base = [outputDir stringByAppendingPathComponent:name];
        BOOL ok = WritePng(image, [base stringByAppendingPathExtension:@"png"]);
        if (ok) ok = WriteThumb(image, [base stringByAppendingPathExtension:@"rgb"], thumbWidth, thumbHeight);
        CGImageRelease(image);
        if (ok) {
          written++;
        } else {
          failed++;
        }
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
