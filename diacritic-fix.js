/**
 * ═══════════════════════════════════════════════════════════════
 * 🖖 DIACRITIC FIX MODULE – Admirálský Archiv
 * ═══════════════════════════════════════════════════════════════
 * Opravuje českou diakritiku v přílohách z Claude.ai exportu.
 * Anthropic ukládá text příloh v Windows-1252 místo UTF-8.
 * Tento modul převádí bajty zpět na správné UTF-8 znaky.
 *
 * POUŽITÍ v index.html:
 *   <script src="diacritic-fix.js"></script>
 *   Poté je funkce window.fixDiacritics(text) globálně dostupná.
 *   Volá se automaticky na extracted_content každé přílohy.
 * ═══════════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ── Windows-1252 → bajt tabulka (rozsah 0x80–0x9F) ──────────
  // Tyto znaky se v UTF-8 prostředí zobrazují jako rozsypaný čaj
  // např. "Å™" místo "ř", "Ä" místo "č" atd.
  const WIN1252 = {
    '\u20AC': 128, // €
    '\u201A': 130, // ‚
    '\u0192': 131, // ƒ
    '\u201E': 132, // „
    '\u2026': 133, // …
    '\u2020': 134, // †
    '\u2021': 135, // ‡
    '\u02C6': 136, // ˆ
    '\u2030': 137, // ‰
    '\u0160': 138, // Š
    '\u2039': 139, // ‹
    '\u0152': 140, // Œ
    '\u017D': 142, // Ž
    '\u2018': 145, // '
    '\u2019': 146, // '
    '\u201C': 147, // "
    '\u201D': 148, // "
    '\u2022': 149, // •
    '\u2013': 150, // –
    '\u2014': 151, // —
    '\u02DC': 152, // ˜
    '\u2122': 153, // ™
    '\u0161': 154, // š
    '\u203A': 155, // ›
    '\u0153': 156, // œ
    '\u017E': 158, // ž
    '\u0178': 159  // Ÿ
  };

  // ── Detekce zda text potřebuje opravu ───────────────────────
  // Hledá typické znaky mojibake české diakritiky
  const MOJIBAKE_PATTERN = /[ÃÅ°Ä]/;

  function needsFix(text) {
    if (!text || typeof text !== 'string') return false;
    return MOJIBAKE_PATTERN.test(text);
  }

  // ── Hlavní rekonstrukční funkce ──────────────────────────────
  // Převede Windows-1252 mojibake zpět na UTF-8
  function reconstruct(text) {
    if (!text) return text;
    try {
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (WIN1252[char] !== undefined) {
          bytes[i] = WIN1252[char];
        } else {
          const code = text.charCodeAt(i);
          bytes[i] = code <= 255 ? code : (code & 0xFF);
        }
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      console.warn('[DiacriticFix] Chyba dekódování:', e);
      return text;
    }
  }

  // ── Veřejná funkce – plně automatická ───────────────────────
  // Zkontroluje zda text potřebuje opravu, a pokud ano opraví ho
  function fixDiacritics(text) {
    if (!text || typeof text !== 'string') return text || '';
    if (!needsFix(text)) return text; // Už je správně – nesahej na to
    const fixed = reconstruct(text);
    return fixed;
  }

  // ── Dávkové zpracování pole textů ───────────────────────────
  function fixArray(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map(item => {
      if (typeof item === 'string') return fixDiacritics(item);
      if (item && typeof item === 'object') return fixObject(item);
      return item;
    });
  }

  // ── Rekurzivní oprava celého objektu (příloha/attachment) ───
  function fixObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Opravuj jen textové pole kde může být diakritika
        result[key] = fixDiacritics(value);
      } else if (Array.isArray(value)) {
        result[key] = fixArray(value);
      } else if (value && typeof value === 'object') {
        result[key] = fixObject(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // ── Oprava celé přílohy (attachment objekt) ─────────────────
  function fixAttachment(attachment) {
    if (!attachment) return attachment;
    const fixed = { ...attachment };
    // Primární pole kde Anthropic ukládá obsah příloh
    if (fixed.extracted_content) {
      fixed.extracted_content = fixDiacritics(fixed.extracted_content);
    }
    if (fixed.file_name) {
      fixed.file_name = fixDiacritics(fixed.file_name);
    }
    if (fixed.text) {
      fixed.text = fixDiacritics(fixed.text);
    }
    return fixed;
  }

  // ── Oprava celé zprávy ───────────────────────────────────────
  function fixMessage(msg) {
    if (!msg) return msg;
    const fixed = { ...msg };

    // Oprav hlavní text zprávy
    if (fixed.text) fixed.text = fixDiacritics(fixed.text);

    // Oprav přílohy
    if (Array.isArray(fixed.attachments)) {
      fixed.attachments = fixed.attachments.map(fixAttachment);
    }

    // Oprav files
    if (Array.isArray(fixed.files)) {
      fixed.files = fixed.files.map(fixAttachment);
    }

    // Oprav content array
    if (Array.isArray(fixed.content)) {
      fixed.content = fixed.content.map(item => {
        if (!item) return item;
        const fi = { ...item };
        if (fi.text) fi.text = fixDiacritics(fi.text);
        if (fi.content && typeof fi.content === 'string') {
          fi.content = fixDiacritics(fi.content);
        }
        return fi;
      });
    }

    return fixed;
  }

  // ── Oprava celé konverzace ───────────────────────────────────
  function fixConversation(conv) {
    if (!conv) return conv;
    const fixed = { ...conv };
    if (fixed.name) fixed.name = fixDiacritics(fixed.name);
    if (fixed.summary) fixed.summary = fixDiacritics(fixed.summary);
    if (Array.isArray(fixed.chat_messages)) {
      fixed.chat_messages = fixed.chat_messages.map(fixMessage);
    }
    if (Array.isArray(fixed.messages)) {
      fixed.messages = fixed.messages.map(fixMessage);
    }
    return fixed;
  }

  // ── Oprava celého exportu (pole konverzací) ──────────────────
  function fixExport(data) {
    if (!data) return data;
    if (Array.isArray(data)) {
      return data.map(fixConversation);
    }
    if (data.conversations) {
      return { ...data, conversations: data.conversations.map(fixConversation) };
    }
    return data;
  }

  // ── Export do globálního scope ───────────────────────────────
  window.DiacriticFix = {
    // Hlavní funkce – zavolej na celý export hned po JSON.parse()
    fixExport,
    // Dílčí funkce pro ruční použití
    fixConversation,
    fixMessage,
    fixAttachment,
    fixDiacritics,
    needsFix
  };

  console.log('[DiacriticFix] 🖖 Modul načten – window.DiacriticFix připraven.');

})();