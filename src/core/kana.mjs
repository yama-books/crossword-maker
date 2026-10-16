/** Japanese crossword answer normalization. No dependencies; also embedded in the offline player. */
const SMALL_KANA = Object.freeze({
  'ァ':'ア','ィ':'イ','ゥ':'ウ','ェ':'エ','ォ':'オ',
  'ッ':'ツ','ャ':'ヤ','ュ':'ユ','ョ':'ヨ','ヮ':'ワ',
  'ヵ':'カ','ヶ':'ケ'
});
const KANA_CHARACTER = /^[ァ-ヴー]$/u;

export function normalizeKana(value, { strict = false } = {}) {
  if (typeof value !== 'string') throw new TypeError('Kana value must be a string');
  const folded = value.normalize('NFKC').replace(/[ぁ-ゖ]/gu,
    character => String.fromCodePoint(character.codePointAt(0) + 0x60));
  const expanded = [...folded].map(character => SMALL_KANA[character] ?? character);
  if (strict && (expanded.length === 0 || expanded.some(character => !KANA_CHARACTER.test(character)))) {
    throw new Error('Invalid kana characters');
  }
  return expanded.filter(character => KANA_CHARACTER.test(character)).join('');
}
