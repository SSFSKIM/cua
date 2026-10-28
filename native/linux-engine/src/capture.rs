//! Screenshot encoding (behaviour §16): the X image read as B,G,R,X, converted to RGB and encoded as JPEG at
//! quality 80 with 4:4:4 sampling, written as `<pid>_<nanoseconds>.jpg`.

use std::path::{Path, PathBuf};

use anyhow::Result;

pub const JPEG_QUALITY: u8 = 80;

/// Reads a ZPixmap as B,G,R,X with a stride of `width * 4`, whatever the visual says, as the vendor does; a reply
/// shorter than that is refused with the vendor's sentence (a depth-16 visual fails, behaviour §16).
pub fn bgrx_to_rgb(data: &[u8], width: u16, height: u16) -> Result<Vec<u8>, String> {
    let pixels = width as usize * height as usize;
    if data.len() < pixels * 4 {
        return Err(format!(
            "x11 screenshot {} bytes, expected at least {} bytes",
            data.len(),
            pixels * 4
        ));
    }
    let mut rgb = Vec::with_capacity(pixels * 3);
    for px in data[..pixels * 4].chunks_exact(4) {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    Ok(rgb)
}

/// `image`'s baseline encoder at quality 80: JFIF 1.2, density 1×1 without units, 4:4:4 (its fixed sampling).
pub fn encode_jpeg(rgb: &[u8], width: u16, height: u16) -> Result<Vec<u8>> {
    let mut out = Vec::with_capacity(rgb.len() / 8);
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY).encode(
        rgb,
        width as u32,
        height as u32,
        image::ExtendedColorType::Rgb8,
    )?;
    Ok(out)
}

pub fn screenshot_name(pid: u32, nanos: u128) -> String {
    format!("{pid}_{nanos}.jpg")
}

/// Writes `jpeg` into `dir` under the vendor's naming and returns its path.
pub fn write_screenshot(dir: &Path, jpeg: &[u8]) -> Result<PathBuf> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| anyhow::anyhow!("system time is before the Unix epoch"))?
        .as_nanos();
    let path = dir.join(screenshot_name(std::process::id(), nanos));
    std::fs::write(&path, jpeg).map_err(|e| anyhow::anyhow!("failed to write {}: {e}", path.display()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixels_are_read_as_bgrx_with_a_stride_of_four_bytes() {
        let data = [1, 2, 3, 0xff, 10, 20, 30, 0];
        assert_eq!(bgrx_to_rgb(&data, 2, 1), Ok(vec![3, 2, 1, 30, 20, 10]));
        // extra bytes after w*h*4 are ignored
        assert_eq!(bgrx_to_rgb(&[1, 2, 3, 4, 5], 1, 1), Ok(vec![3, 2, 1]));
    }

    #[test]
    fn a_short_image_carries_the_vendor_sentence() {
        assert_eq!(
            bgrx_to_rgb(&[0; 6], 2, 1),
            Err("x11 screenshot 6 bytes, expected at least 8 bytes".into())
        );
    }

    /// The JPEG marker segments, as (marker, payload).
    fn segments(jpeg: &[u8]) -> Vec<(u8, Vec<u8>)> {
        assert_eq!(&jpeg[..2], &[0xff, 0xd8], "SOI");
        let mut out = Vec::new();
        let mut i = 2;
        while i + 4 <= jpeg.len() {
            assert_eq!(jpeg[i], 0xff);
            let marker = jpeg[i + 1];
            let len = u16::from_be_bytes([jpeg[i + 2], jpeg[i + 3]]) as usize;
            out.push((marker, jpeg[i + 4..i + 2 + len].to_vec()));
            if marker == 0xda {
                break;
            }
            i += 2 + len;
        }
        out
    }

    const ZIGZAG: [usize; 64] = [
        0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14,
        21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60,
        61, 54, 47, 55, 62, 63,
    ];
    /// ITU T.81 Annex K tables, natural order.
    const LUMA: [u32; 64] = [
        16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29,
        51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121,
        120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
    ];
    const CHROMA: [u32; 64] = [
        17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99,
        99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
        99, 99, 99, 99, 99, 99, 99, 99,
    ];

    fn scaled(table: &[u32; 64], quality: u32) -> Vec<u8> {
        let scale = if quality < 50 {
            5000 / quality
        } else {
            200 - quality * 2
        };
        ZIGZAG
            .iter()
            .map(|&n| ((table[n] * scale + 50) / 100).clamp(1, 255) as u8)
            .collect()
    }

    #[test]
    fn jpeg_is_quality_80_with_4_4_4_sampling_and_a_jfif_1_2_header() {
        let (w, h) = (17u16, 9u16);
        let rgb: Vec<u8> = (0..w as usize * h as usize * 3).map(|i| (i * 7 % 251) as u8).collect();
        let jpeg = encode_jpeg(&rgb, w, h).unwrap();
        let segs = segments(&jpeg);
        let app0 = &segs.iter().find(|(m, _)| *m == 0xe0).expect("APP0").1;
        assert_eq!(&app0[..5], b"JFIF\0");
        assert_eq!(&app0[5..7], &[1, 2], "JFIF 1.2");
        assert_eq!(&app0[7..12], &[0, 0, 1, 0, 1], "no units, density 1x1");
        let sof = &segs.iter().find(|(m, _)| *m == 0xc0).expect("baseline SOF0").1;
        assert_eq!(u16::from_be_bytes([sof[1], sof[2]]), h);
        assert_eq!(u16::from_be_bytes([sof[3], sof[4]]), w);
        assert_eq!(sof[5], 3, "three components");
        for c in 0..3 {
            assert_eq!(sof[6 + c * 3 + 1], 0x11, "component {c} is sampled 1x1 (4:4:4)");
        }
        let mut tables = std::collections::BTreeMap::new();
        for (_, payload) in segs.iter().filter(|(m, _)| *m == 0xdb) {
            let mut p = &payload[..];
            while !p.is_empty() {
                assert_eq!(p[0] >> 4, 0, "8-bit tables");
                tables.insert(p[0] & 0x0f, p[1..65].to_vec());
                p = &p[65..];
            }
        }
        assert_eq!(tables[&0], scaled(&LUMA, 80));
        assert_eq!(tables[&1], scaled(&CHROMA, 80));
    }

    #[test]
    fn jpeg_round_trips_to_the_same_size_and_close_pixels() {
        let (w, h) = (32u16, 16u16);
        let rgb: Vec<u8> = (0..w as usize * h as usize)
            .flat_map(|i| [(i % 32 * 8) as u8, 128, (i / 32 * 16) as u8])
            .collect();
        let jpeg = encode_jpeg(&rgb, w, h).unwrap();
        let decoded = image::load_from_memory_with_format(&jpeg, image::ImageFormat::Jpeg)
            .unwrap()
            .to_rgb8();
        assert_eq!((decoded.width(), decoded.height()), (w as u32, h as u32));
        let mean: f64 = decoded
            .as_raw()
            .iter()
            .zip(&rgb)
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / rgb.len() as f64;
        assert!(mean < 4.0, "mean absolute difference {mean}");
    }

    #[test]
    fn files_are_named_pid_underscore_nanoseconds() {
        assert_eq!(
            screenshot_name(31747, 1793171648543593690),
            "31747_1793171648543593690.jpg"
        );
        let dir = std::env::temp_dir().join(format!("cua-engine-capture-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = write_screenshot(&dir, b"\xff\xd8\xff\xd9").unwrap();
        assert!(
            path.file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with(&format!("{}_", std::process::id()))
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"\xff\xd8\xff\xd9");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
