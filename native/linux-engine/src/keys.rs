//! Chords: the vendor's key grammar (behaviour §11.1) and its keysym-to-keycode resolution with the Shift rule
//! (§11.2), reproduced over the core protocol's keyboard mapping instead of libX11.

/// A core `GetKeyboardMapping` answer: `per` keysyms for each keycode from `min_keycode`.
#[derive(Debug, Clone)]
pub struct Keymap {
    pub min_keycode: u8,
    pub per: usize,
    pub syms: Vec<u32>,
}

const SHIFT_L: u32 = 0xffe1;
const SHIFT_R: u32 = 0xffe2;

/// Splits a chord on `+` into keysyms, in order, duplicates kept (behaviour §11.1). An empty part toggles a flag
/// and a second consecutive empty part is `plus`, so `+`, `ctrl++` and `+++` name the plus key.
pub fn parse_chord(key: &str) -> Result<Vec<u32>, String> {
    let mut keysyms = Vec::new();
    let mut empty_seen = false;
    for part in key.split('+') {
        let part = part.trim();
        if part.is_empty() {
            if empty_seen {
                keysyms.push(0x2b);
            }
            empty_seen = !empty_seen;
            continue;
        }
        empty_seen = false;
        let lower = part.to_ascii_lowercase();
        let name = match lower.strip_prefix("xk_") {
            Some(rest) if lower.len() >= 3 => rest,
            _ => lower.as_str(),
        };
        keysyms.push(keysym_for(name).ok_or_else(|| format!("unsupported key={name}"))?);
    }
    Ok(keysyms)
}

/// One normalized part: a single printable ASCII character (letters as their uppercase keysym) or a name of the
/// pinned build's table. There is no `XStringToKeysym` fallback.
fn keysym_for(name: &str) -> Option<u32> {
    let bytes = name.as_bytes();
    if bytes.len() == 1 {
        let c = bytes[0];
        return match c {
            b'a'..=b'z' => Some((c - b'a' + b'A') as u32),
            0x21..=0x7e => Some(c as u32),
            _ => None,
        };
    }
    if let Some(n) = name.strip_prefix('f').and_then(|n| n.parse::<u32>().ok())
        && (1..=20).contains(&n)
        && !name[1..].starts_with('0')
    {
        return Some(0xffbe + n - 1);
    }
    let kp = name.strip_prefix("kp_").or_else(|| name.strip_prefix("kp"));
    if let Some(digit) = kp
        && digit.len() == 1
        && let Some(d) = digit.chars().next().and_then(|c| c.to_digit(10))
    {
        return Some(0xffb0 + d);
    }
    Some(match name {
        "ctrl" | "lctrl" | "control_l" => 0xffe3,
        "rctrl" | "control_r" => 0xffe4,
        "alt" | "lalt" | "alt_l" => 0xffe9,
        "ralt" | "alt_r" => 0xffea,
        "shift" | "lshift" | "shift_l" => SHIFT_L,
        "rshift" | "shift_r" => SHIFT_R,
        "meta" | "lmeta" | "meta_l" => 0xffe7,
        "rmeta" | "meta_r" => 0xffe8,
        "super" | "lsuper" | "super_l" => 0xffeb,
        "rsuper" | "super_r" => 0xffec,
        "enter" | "return" => 0xff0d,
        "kpenter" | "kp_enter" => 0xff8d,
        "esc" | "escape" => 0xff1b,
        "tab" => 0xff09,
        "bsp" | "backspace" => 0xff08,
        "del" | "delete" => 0xffff,
        "ins" | "insert" => 0xff63,
        "home" => 0xff50,
        "end" => 0xff57,
        "left" => 0xff51,
        "up" => 0xff52,
        "right" => 0xff53,
        "down" => 0xff54,
        "pgup" | "page_up" => 0xff55,
        "pgdn" | "page_down" => 0xff56,
        "pause" => 0xff13,
        "scrlk" | "scroll_lock" => 0xff14,
        "sysrq" | "sys_req" => 0xff15,
        "numlk" | "num_lock" => 0xff7f,
        "caplk" | "caps_lock" => 0xffe5,
        "space" | "spacebar" | "sb" => 0x20,
        "plus" => 0x2b,
        "less" => 0x3c,
        "greater" => 0x3e,
        "percent" => 0x25,
        "exclam" => 0x21,
        "dollar" => 0x24,
        "period" => 0x2e,
        "ampersand" => 0x26,
        "asterisk" => 0x2a,
        "question" => 0x3f,
        "slash" | "fslash" => 0x2f,
        "bslash" | "backslash" => 0x5c,
        "comma" => 0x2c,
        "minus" => 0x2d,
        "colon" => 0x3a,
        "semicolon" => 0x3b,
        "equal" => 0x3d,
        "at" => 0x40,
        "bar" => 0x7c,
        "grave" => 0x60,
        "parenleft" => 0x28,
        "parenright" => 0x29,
        "braceleft" => 0x7b,
        "braceright" => 0x7d,
        "bracketleft" => 0x5b,
        "bracketright" => 0x5d,
        "quotedbl" => 0x22,
        "apostrophe" => 0x27,
        "numbersign" => 0x23,
        "underscore" => 0x5f,
        "asciitilde" => 0x7e,
        "asciicircum" => 0x5e,
        _ => return None,
    })
}

impl Keymap {
    /// The keysym in `column` of `keycode`'s core mapping row; 0 (NoSymbol) outside it.
    pub fn keysym(&self, keycode: u8, column: usize) -> u32 {
        if keycode < self.min_keycode || column >= self.per {
            return 0;
        }
        self.syms
            .get((keycode - self.min_keycode) as usize * self.per + column)
            .copied()
            .unwrap_or(0)
    }

    fn max_keycode(&self) -> u8 {
        let rows = self.syms.len().checked_div(self.per).unwrap_or(0);
        (self.min_keycode as usize + rows).saturating_sub(1).min(255) as u8
    }

    /// `XKeysymToKeycode` (behaviour §11.2): the first keycode carrying `keysym`, scanning one level across every
    /// keycode before the next level. libX11 scans XKB's per-key layout (group 1's levels, then group 2's); the core
    /// row is ordered group 1 levels 1–2, group 2 levels 1–2, then the higher levels, so the columns are visited
    /// as 0, 1, 4, 5, …, then 2, 3. On a single-group layout that is libX11's order exactly. 0 when none.
    pub fn keycode_for(&self, keysym: u32) -> u8 {
        if keysym == 0 {
            return 0;
        }
        let mut columns: Vec<usize> = (0..self.per.min(2)).collect();
        columns.extend(4..self.per);
        columns.extend((2..self.per.min(4)).filter(|c| *c < self.per));
        for column in columns {
            for keycode in self.min_keycode..=self.max_keycode() {
                if self.keysym(keycode, column) == keysym {
                    return keycode;
                }
            }
        }
        0
    }
}

/// The keycodes a chord presses, in order, with Shift_L synthesized before a key whose keysym is at level 1 but
/// not level 0 — never for A–Z, so `Z` types z and `Ctrl+Z` stays undo — at most once, and not after an explicit
/// Shift (behaviour §11.2).
pub fn resolve(chord: &[u32], map: &Keymap) -> Result<Vec<u8>, String> {
    let mut keycodes = Vec::with_capacity(chord.len() + 1);
    let mut shift_seen = false;
    for &keysym in chord {
        let keycode = map.keycode_for(keysym);
        if keycode == 0 {
            return Err(format!(
                "resolve_keys failed xlib::XKeysymToKeycode keysym=0x{keysym:x}"
            ));
        }
        let shifted_only = map.keysym(keycode, 1) == keysym && map.keysym(keycode, 0) != keysym;
        if !(0x41..=0x5a).contains(&keysym) && !shift_seen && shifted_only {
            let shift = map.keycode_for(SHIFT_L);
            if shift == 0 {
                return Err("resolve_keys failed xlib::XKeysymToKeycode for synthesized Shift".into());
            }
            keycodes.push(shift);
            shift_seen = true;
        }
        if keysym == SHIFT_L || keysym == SHIFT_R {
            shift_seen = true;
        }
        keycodes.push(keycode);
    }
    Ok(keycodes)
}

/// `type_characters`' keys (behaviour §11.4): for each character, its keycode, after Shift_L when the layout has it at
/// level 2 only (letters included, unlike a chord's rule), or the first character the layout cannot produce at level 1
/// or 2: a control character, a keysym no key carries, or one only at a higher level (AltGr is never used). The
/// keysym is the code point below 0x100, else 0x1000000 plus it, as the newest build looks it up.
pub fn literal_keycodes(text: &str, map: &Keymap) -> Result<Vec<Vec<u8>>, char> {
    let shift = map.keycode_for(SHIFT_L);
    text.chars()
        .map(|c| {
            let code = u32::from(c);
            if code < 0x20 || (0x7f..=0x9f).contains(&code) {
                return Err(c);
            }
            let keysym = if code < 0x100 { code } else { 0x0100_0000 + code };
            let keycode = map.keycode_for(keysym);
            match keycode {
                0 => Err(c),
                _ if map.keysym(keycode, 0) == keysym => Ok(vec![keycode]),
                _ if map.keysym(keycode, 1) == keysym && shift != 0 => Ok(vec![shift, keycode]),
                _ => Err(c),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONTROL_L: u32 = 0xffe3;
    const SHIFT_L: u32 = 0xffe1;
    const PLUS: u32 = 0x2b;

    #[test]
    fn plus_signs_follow_the_empty_part_toggle() {
        assert_eq!(parse_chord("+"), Ok(vec![PLUS]));
        assert_eq!(parse_chord("ctrl++"), Ok(vec![CONTROL_L, PLUS]));
        assert_eq!(parse_chord("+++"), Ok(vec![PLUS, PLUS]));
        assert_eq!(parse_chord("ctrl+"), Ok(vec![CONTROL_L]));
        assert_eq!(parse_chord("a++b"), Ok(vec![0x41, 0x42]));
        assert_eq!(parse_chord(""), Ok(vec![]));
        assert_eq!(parse_chord("   "), Ok(vec![]));
    }

    #[test]
    fn parts_are_trimmed_lowercased_and_lose_a_leading_xk() {
        assert_eq!(parse_chord(" Ctrl + Shift + T "), Ok(vec![CONTROL_L, SHIFT_L, 0x54]));
        assert_eq!(parse_chord("XK_Return"), Ok(vec![0xff0d]));
        assert_eq!(parse_chord("xk_a"), Ok(vec![0x41]));
        assert_eq!(parse_chord("a+a"), Ok(vec![0x41, 0x41]));
        assert_eq!(parse_chord("xk"), Err("unsupported key=xk".into()));
    }

    #[test]
    fn letters_map_to_the_uppercase_keysym_and_printable_ascii_to_its_code() {
        assert_eq!(parse_chord("z"), Ok(vec![0x5a]));
        assert_eq!(parse_chord("Z"), Ok(vec![0x5a]));
        assert_eq!(parse_chord("7"), Ok(vec![0x37]));
        assert_eq!(parse_chord("!"), Ok(vec![0x21]));
        assert_eq!(parse_chord("ctrl+~"), Ok(vec![CONTROL_L, 0x7e]));
    }

    #[test]
    fn the_name_table_is_the_pinned_one() {
        let cases: &[(&str, u32)] = &[
            ("lctrl", 0xffe3),
            ("control_r", 0xffe4),
            ("alt", 0xffe9),
            ("ralt", 0xffea),
            ("rshift", 0xffe2),
            ("meta", 0xffe7),
            ("rmeta", 0xffe8),
            ("super", 0xffeb),
            ("rsuper", 0xffec),
            ("enter", 0xff0d),
            ("kp_enter", 0xff8d),
            ("esc", 0xff1b),
            ("tab", 0xff09),
            ("bsp", 0xff08),
            ("del", 0xffff),
            ("ins", 0xff63),
            ("home", 0xff50),
            ("end", 0xff57),
            ("left", 0xff51),
            ("up", 0xff52),
            ("right", 0xff53),
            ("down", 0xff54),
            ("pgup", 0xff55),
            ("page_down", 0xff56),
            ("pause", 0xff13),
            ("scrlk", 0xff14),
            ("sys_req", 0xff15),
            ("numlk", 0xff7f),
            ("caps_lock", 0xffe5),
            ("sb", 0x20),
            ("f1", 0xffbe),
            ("f20", 0xffd1),
            ("kp0", 0xffb0),
            ("kp_9", 0xffb9),
            ("plus", 0x2b),
            ("question", 0x3f),
            ("fslash", 0x2f),
            ("bslash", 0x5c),
            ("bar", 0x7c),
            ("grave", 0x60),
            ("quotedbl", 0x22),
            ("asciicircum", 0x5e),
        ];
        for &(name, keysym) in cases {
            assert_eq!(parse_chord(name), Ok(vec![keysym]), "{name}");
        }
    }

    #[test]
    fn other_names_are_unsupported_with_the_normalized_part() {
        for name in [
            "control", "ctl", "cmd", "win", "altgr", "prior", "next", "pageup", "print", "menu", "kp_add", "f21",
        ] {
            assert_eq!(parse_chord(name), Err(format!("unsupported key={name}")));
        }
        assert_eq!(parse_chord("XK_Foo"), Err("unsupported key=foo".into()));
        assert_eq!(parse_chord("ctrl+é"), Err("unsupported key=é".into()));
    }

    /// A US-like layout: 10 = 1 !, 11 = 2 @, 37 = Control_L, 38 = a A, 50 = Shift_L, 52 = z Z, 59 = , <,
    /// 94 = < > (the pc105 extra key), 36 = Return.
    fn us(with_shift: bool) -> Keymap {
        let min = 8u8;
        let per = 4;
        let mut syms = vec![0u32; (255 - min as usize + 1) * per];
        let mut set = |kc: u8, a: u32, b: u32| {
            let i = (kc - min) as usize * per;
            syms[i] = a;
            syms[i + 1] = b;
            syms[i + 2] = a;
            syms[i + 3] = b;
        };
        set(10, 0x31, 0x21);
        set(11, 0x32, 0x40);
        set(36, 0xff0d, 0);
        set(37, 0xffe3, 0);
        set(38, 0x61, 0x41);
        if with_shift {
            set(50, 0xffe1, 0);
        }
        set(52, 0x7a, 0x5a);
        set(59, 0x2c, 0x3c);
        set(94, 0x3c, 0x3e);
        Keymap {
            min_keycode: min,
            per,
            syms,
        }
    }

    #[test]
    fn keysym_lookup_scans_the_base_level_of_every_key_first() {
        let map = us(true);
        assert_eq!(
            map.keycode_for(0x3c),
            94,
            "< at level 0 of the extra key wins over Shift+comma"
        );
        assert_eq!(map.keycode_for(0x41), 38);
        assert_eq!(map.keycode_for(0xff13), 0);
        assert_eq!(map.keysym(38, 0), 0x61);
        assert_eq!(map.keysym(38, 1), 0x41);
    }

    #[test]
    fn shift_is_synthesized_only_for_shifted_symbols_never_for_letters() {
        let map = us(true);
        assert_eq!(
            resolve(&parse_chord("Z").unwrap(), &map),
            Ok(vec![52]),
            "Z types z, as in both vendor builds"
        );
        assert_eq!(resolve(&parse_chord("ctrl+z").unwrap(), &map), Ok(vec![37, 52]));
        assert_eq!(resolve(&parse_chord("!").unwrap(), &map), Ok(vec![50, 10]));
        assert_eq!(
            resolve(&parse_chord("shift+!").unwrap(), &map),
            Ok(vec![50, 10]),
            "an explicit Shift earlier counts"
        );
        assert_eq!(
            resolve(&parse_chord("!+@").unwrap(), &map),
            Ok(vec![50, 10, 11]),
            "at most one Shift per chord"
        );
        assert_eq!(resolve(&parse_chord("1").unwrap(), &map), Ok(vec![10]));
        assert_eq!(resolve(&parse_chord("<").unwrap(), &map), Ok(vec![94]));
        assert_eq!(resolve(&parse_chord("shift+a").unwrap(), &map), Ok(vec![50, 38]));
    }

    #[test]
    fn literal_characters_take_their_level_with_shift_for_level_two_letters_included() {
        // the newest build's events for " AbZ09!?" (m2-2/newest-typechars.txt): letters by case, Shift for A and Z
        let map = us(true);
        assert_eq!(
            literal_keycodes("aAzZ!1<", &map),
            Ok(vec![
                vec![38],
                vec![50, 38],
                vec![52],
                vec![50, 52],
                vec![50, 10],
                vec![10],
                vec![94]
            ])
        );
        assert_eq!(literal_keycodes("", &map), Ok(vec![]));
    }

    #[test]
    fn a_character_off_the_layout_refuses_the_whole_text() {
        let map = us(true);
        assert_eq!(
            literal_keycodes("aé", &map),
            Err('é'),
            "the first character the layout lacks"
        );
        assert_eq!(
            literal_keycodes("Ω", &map),
            Err('Ω'),
            "beyond Latin-1 the keysym is 0x1000000 + its code point"
        );
        assert_eq!(
            literal_keycodes("az\nza", &map),
            Err('\n'),
            "control characters, newline and tab included"
        );
        assert_eq!(literal_keycodes("\t", &map), Err('\t'));
        assert_eq!(literal_keycodes("\u{85}", &map), Err('\u{85}'));
        assert_eq!(literal_keycodes("a\u{301}", &map), Err('\u{301}'));
        assert_eq!(literal_keycodes("!", &us(false)), Err('!'), "no Shift on the layout");
    }

    #[test]
    fn a_character_only_at_a_third_level_is_refused_never_typed_with_altgr() {
        // German: q Q q Q @ … at AltGr+q; the newest build answers `cannot type literal keysym 0x40`
        let mut map = us(true);
        map.per = 6;
        map.syms = vec![0; (255 - 8 + 1) * 6];
        let row = |kc: u8| (kc - 8) as usize * 6;
        map.syms[row(24)..row(24) + 6].copy_from_slice(&[0x71, 0x51, 0x71, 0x51, 0x40, 0]);
        map.syms[row(50)] = 0xffe1;
        assert_eq!(literal_keycodes("qQ", &map), Ok(vec![vec![24], vec![50, 24]]));
        assert_eq!(literal_keycodes("q@", &map), Err('@'));
    }

    #[test]
    fn unresolvable_keysyms_carry_the_vendor_sentences() {
        assert_eq!(
            resolve(&parse_chord("pause").unwrap(), &us(true)),
            Err("resolve_keys failed xlib::XKeysymToKeycode keysym=0xff13".into())
        );
        assert_eq!(
            resolve(&parse_chord("!").unwrap(), &us(false)),
            Err("resolve_keys failed xlib::XKeysymToKeycode for synthesized Shift".into())
        );
    }
}
