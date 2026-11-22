/* save.js - localStorage 자동 저장/불러오기 */
(function () {
  'use strict';
  const PJ = window.PJ;
  const KEY = 'parkjuim_rpg_save_v1';

  function defaults() {
    return {
      v: 1, level: 1, exp: 0, gold: 0, rank: 0,
      skills: { weedPull: 1, mower: 1, shovel: 1, blower: 1, kind: 1 },
      stats: { weed: 0, snow: 0, complaint: 0, event: 0, boss: 0 },
      items: { hotpack: 0, quietMower: 0, earmuff: 0, coffee: 0, catSnack: 0 },
      auto: false, ending: false,
      muted: false, savedAt: 0,
    };
  }
  const num = (v, d, min) => (typeof v === 'number' && isFinite(v) ? Math.max(min == null ? 0 : min, v) : d);

  PJ.Save = {
    KEY,
    load() {
      const d = defaults();
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return d;
        const s = JSON.parse(raw);
        d.rank = Math.min(PJ.RANKS.length - 1, Math.floor(num(s.rank, 0)));
        d.level = Math.min(PJ.RANKS[d.rank].maxLv, Math.floor(num(s.level, 1, 1)));
        d.exp = num(s.exp, 0); d.gold = Math.floor(num(s.gold, 0));
        Object.keys(d.skills).forEach((k) => { d.skills[k] = Math.min(15, Math.floor(num(s.skills && s.skills[k], 1, 1))); });
        Object.keys(d.stats).forEach((k) => { d.stats[k] = Math.floor(num(s.stats && s.stats[k], 0)); });
        Object.keys(d.items).forEach((k) => { d.items[k] = Math.min(PJ.ITEM_MAX, Math.floor(num(s.items && s.items[k], 0))); });
        d.auto = !!s.auto; d.ending = !!s.ending;
        d.muted = !!s.muted;
      } catch (e) { console.warn('[Save] 불러오기 실패, 새로 시작합니다.', e); }
      return d;
    },
    write(data) {
      try { data.savedAt = Date.now(); localStorage.setItem(KEY, JSON.stringify(data)); return true; }
      catch (e) { return false; }
    },
    reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };
})();
