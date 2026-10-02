import E from '../data/skills/empower.json';
import type { FxStatus, TreeSkill } from '../data';

/**
 * Forma fortificada: toda habilidade ativa que chega ao Nv 5 ganha uma segunda versão, mais cara em
 * MP, com um "algo a mais" (golpe duplo, explosão em área, ricochete, estado do elemento, roubo de
 * vida, execução…). Na batalha aparecem as duas: normal e fortificada. É segredo — só se descobre
 * treinando, e a taverna dá dicas. Números em `data/skills/empower.json`.
 */
export const EMPOWER = E;
export const FORTIFIED_SUFFIX = '__forte';

const STATUS_LABEL: Record<string, string> = {
  queimando: 'queimando', lento: 'lento', eletrocutado: 'eletrocutado', molhado: 'molhado', imobilizado: 'imobilizado',
  derrubado: 'derrubado', cegado: 'cego', enfraquecido: 'enfraquecido', envenenado: 'envenenado', sangramento: 'sangrando',
  quebrado: 'com a guarda quebrada', atordoado: 'atordoado',
};

const ACTIVE = new Set(['physical', 'ranged', 'magic', 'heal', 'buff', 'utility', 'summon']);

export function isFortified(id: string): boolean {
  return id.endsWith(FORTIFIED_SUFFIX);
}

export function fortifiedId(id: string): string {
  return id + FORTIFIED_SUFFIX;
}

export function baseOfFortified(id: string): string {
  return id.endsWith(FORTIFIED_SUFFIX) ? id.slice(0, -FORTIFIED_SUFFIX.length) : id;
}

function pick<T>(id: string, list: T[]): T {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length]!;
}

type Variant = { label: string; apply: (s: TreeSkill) => void };

/** Bônus possíveis para esta habilidade (conforme tipo, forma e elemento). */
function variants(s: TreeSkill): Variant[] {
  const area = s.shape === 'cone' || s.shape === 'line' || (s.radius ?? 0) > 0 || s.shape === 'radius';
  const fx = () => (s.fx ??= {});
  const out: Variant[] = [];
  const elStatus = s.element ? (E.elementStatus as Record<string, FxStatus | undefined>)[s.element] : undefined;
  if (s.kind === 'physical' || s.kind === 'ranged' || s.kind === 'magic') {
    if (s.power <= 0) {
      out.push({ label: 'efeito dura mais e alcança quem está ao redor', apply: (t) => {
        if (t.status) t.status = { ...t.status, turns: t.status.turns + 1 };
        if (t.shape !== 'cone' && t.shape !== 'line') {
          t.radius = (t.radius ?? 0) + 1;
          t.shape = 'radius';
        }
      } });
      return out;
    }
    if (s.shape === 'line') {
      out.push({ label: 'impacto final explode ao redor do alvo', apply: (t) => (fx().burstAround = { radius: 1, power: Math.max(1, Math.round(t.power * 0.5)), around: 'target' }) });
    } else if (area) {
      out.push({ label: 'área maior (+1)', apply: (t) => (t.radius = (t.radius ?? 0) + 1) });
    } else {
      out.push({ label: 'golpe duplo: acerta duas vezes', apply: (t) => {
        fx().hits = (t.fx?.hits ?? 1) + 1;
        t.power = Math.max(1, Math.round(t.power * E.doubleHitPower));
      } });
      if (s.target !== 'self')
        out.push({ label: 'vira explosão em área (raio 1, cuidado com aliados)', apply: (t) => {
          t.radius = 1;
          t.shape = 'radius';
        } });
      if (s.kind !== 'physical') out.push({ label: `ricocheteia em mais ${E.chain} inimigos`, apply: () => {
        fx().chain = E.chain;
        fx().chainMult = E.chainMult;
      } });
      if (s.kind === 'physical') out.push({ label: `executa: derruba alvos abaixo de ${Math.round(E.execute * 100)}% da vida`, apply: () => (fx().execute = E.execute) });
    }
    if (elStatus && !s.status) out.push({ label: `deixa o alvo ${STATUS_LABEL[elStatus.id] ?? elStatus.id}`, apply: (t) => (t.status = { ...elStatus }) });
    if (!s.element && s.kind !== 'magic' && !s.status) {
      const st = pick(s.id + 'st', E.physicalStatus as FxStatus[]);
      out.push({ label: `deixa o alvo ${STATUS_LABEL[st.id] ?? st.id}`, apply: (t) => (t.status = { ...st }) });
    }
    if (s.element === 'sombra' || s.kind === 'physical') out.push({ label: `rouba ${Math.round(E.lifesteal * 100)}% do dano como vida`, apply: () => (fx().lifesteal = (s.fx?.lifesteal ?? 0) + E.lifesteal) });
    // Crítico extra só quando não há bônus mais interessante.
    if (out.length < 2) out.push({ label: `+${E.crit}% de chance de crítico`, apply: () => (fx().crit = (s.fx?.crit ?? 0) + E.crit) });
    return out;
  }
  if (s.kind === 'heal') {
    if ((s.radius ?? 0) > 0) out.push({ label: 'área maior (+1) e escudo nos curados', apply: (t) => {
      t.radius = (t.radius ?? 0) + 1;
      fx().allyShield = (t.fx?.allyShield ?? 0) + 0.1;
    } });
    else out.push({ label: 'cura todos ao redor do alvo (raio 1)', apply: (t) => {
      t.radius = 1;
      t.shape = 'radius';
    } });
    return out;
  }
  if (s.kind === 'buff') {
    out.push({ label: 'alcança os aliados próximos (+1 de raio) e dura +2 turnos', apply: (t) => {
      t.radius = (t.radius ?? 0) + 1;
      if (t.shape !== 'cone' && t.shape !== 'line') t.shape = 'radius';
      if (t.status) t.status = { ...t.status, turns: t.status.turns + 2 };
    } });
    return out;
  }
  if (s.kind === 'summon' && s.fx?.summon?.length) {
    out.push({ label: 'invoca uma criatura a mais', apply: (t) => (fx().summon = t.fx!.summon!.map((x, i) => (i === 0 ? { ...x, count: (x.count ?? 1) + 1 } : x))) });
    return out;
  }
  // Utilidade: efeito mais longo e, se for de área, maior.
  out.push({ label: 'efeito dura +1 turno e a recarga cai 1', apply: (t) => {
    if (t.status) t.status = { ...t.status, turns: t.status.turns + 1 };
    if (t.value) t.value += 1;
    t.cooldown = Math.max(0, (t.cooldown ?? 0) - 1);
    if ((t.radius ?? 0) > 0) t.radius! += 1;
  } });
  return out;
}

/** Versão fortificada de uma habilidade de teia (ou null para passivas e reações). */
export function fortify(s: TreeSkill): { skill: TreeSkill; bonus: string } | null {
  if (!ACTIVE.has(s.kind)) return null;
  const v = pick(s.id, variants(s));
  const t: TreeSkill = JSON.parse(JSON.stringify(s));
  t.id = fortifiedId(s.id);
  t.name = `${s.name} ✦`;
  t.mp = Math.ceil((s.mp ?? 0) * E.mpMult) + E.mpExtra;
  if (t.power > 0) t.power = Math.round(t.power * (s.ultimate ? E.ultimatePowerMult : E.powerMult) * 10) / 10;
  v.apply(t);
  t.description = `${s.description} ✦ Fortificada: ${v.label}.`;
  return { skill: t, bonus: v.label };
}
