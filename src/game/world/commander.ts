import { raidOutpost } from './outposts';
import CMD from '../data/world/commander.json';
import { node, nodeOpen, places } from './layout';
import { provinceOf, province } from './provinces';
import { ensureWorld, OWNER_LABEL, provinceState, setOwner, type Owner } from './territory';
import { FORCES, GOAL_LABEL, forceLabel, playerSide, removeForce, routeTo, spawnForce, type Force } from './forces';
import { ensureStory } from './story';
import { delayVeil, ensureVeil, veilActive } from './veil';
import { addLog, averageLevel, campaignRng, dayOf, newContractId, type Campaign, type Contract } from './campaign';
import { OPS, REP, RES, addInfluence, addIntel, addRep, counterSlotsLeft, ensurePolitics, opActive, politicsFromFlags, reactTo } from './politics';

/**
 * Camada de comandante (D126): o dia a dia do território, as forças inimigas, as crises com prazo e
 * a renda das províncias. Regras puras sobre a campanha; a tela só mostra e pergunta.
 */
const T = CMD.territory;
const CRISES = CMD.crises;

export function chapterOf(c: Campaign): number {
  return ensureStory(c).chapter;
}

/** Lado do jogador agora (Coroa até o Ato 1; resistência e capitais livres depois). */
export function mySide(c: Campaign): Owner[] {
  return playerSide(chapterOf(c));
}

/** Quem ameaça o reino neste capítulo (para onde caem as províncias com medo no máximo). */
export function threatOwner(c: Campaign): Owner {
  const ch = chapterOf(c);
  if (ch <= 1) return 'resistencia';
  if (ch === 2 || ch === 3) return 'coroa';
  return 'vazio';
}

/**
 * O mapa político muda com a história: depois da Deserção (Ato 2), a região da base passa para a
 * Resistência e o resto do reino fica com a Coroa; com o rei deposto (Ato 4 em diante), o que era da
 * Coroa fica livre e a ameaça passa a ser o Vazio. Aplicado uma vez por capítulo.
 */
export function chapterTerritory(c: Campaign): string[] {
  const w = ensureWorld(c);
  const ch = chapterOf(c);
  if (w.chapter === ch) return [];
  const first = w.chapter === undefined;
  w.chapter = ch;
  if (ch <= 1) return [];
  const out: string[] = [];
  if (ch >= 2) {
    const home = provinceOf(c.baseNode);
    for (const id of [home, ...(province(home)?.neighbors ?? [])]) {
      const st = w.provinces[id];
      if (st && node(id).realm === 'reino' && st.owner !== 'resistencia') setOwner(c, id, 'resistencia', 55);
    }
    if (!first) out.push(`🏴 A região de ${node(c.baseNode).name} agora é da Resistência.`);
  }
  if (ch >= 4) {
    let freed = 0;
    for (const st of Object.values(w.provinces))
      if (st.owner === 'coroa') {
        st.owner = 'livre';
        st.control = 45;
        freed++;
      }
    if (freed && !first) out.push(`🏴 Com o rei deposto, ${freed} províncias da Coroa ficaram livres. A ameaça agora é o Vazio.`);
  }
  return out;
}

/** Um dia passa: medo e controle, quedas, forças e crises. Devolve mensagens importantes. */
export function commanderDay(c: Campaign): string[] {
  const w = ensureWorld(c);
  const out: string[] = [...chapterTerritory(c)];
  const ch = chapterOf(c);
  const day = dayOf(c);
  const side = mySide(c);
  const squadProv = new Set(c.squads.filter((s) => !s.to).map((s) => provinceOf(s.at)));
  const hostileProv = new Map<string, Owner>();
  for (const f of w.forces ?? []) hostileProv.set(provinceOf(f.at), f.owner);
  for (const [id, st] of Object.entries(w.provinces)) {
    if (!nodeOpen(node(id), ch)) continue;
    // Medo no máximo: a província cai antes de qualquer alívio do dia.
    if (st.fear >= 100) {
      const to = hostileProv.get(id) ?? threatOwner(c);
      if (to !== st.owner) {
        const was = st.owner;
        setOwner(c, id, to);
        provinceLostPolitics(c, id, out);
        out.push(`🏴 ${node(id).name} caiu: era da ${OWNER_LABEL[was]}, agora é da ${OWNER_LABEL[to]}.`);
      }
    }
    // O medo volta devagar ao normal; inimigo por perto aumenta, esquadrão aliado acalma.
    if (st.fear > T.fearBase) st.fear -= T.fearDrift;
    if (hostileProv.has(id)) st.fear += 3;
    if (squadProv.has(id) && side.includes(st.owner)) st.fear = Math.max(0, st.fear - T.garrisonFear);
    st.fear = Math.max(0, Math.min(100, st.fear));
  }
  // Forças: uma nova a cada poucos dias (a partir do fim do Prólogo).
  w.nextForceDay ??= day + FORCES.spawnEveryDays;
  if (day >= w.nextForceDay) {
    // Patrulhas redobradas (plano do inimigo) encurtam o intervalo.
    w.nextForceDay = day + Math.max(1, Math.round(FORCES.spawnEveryDays * (opActive(c, 'patrulhas_redobradas') ? OPS.list.patrulhas_redobradas.spawnMult : 1)));
    const f = spawnForce(c, campaignRng(c), ch, Math.max(1, averageLevel(c)), c.squads.map((s) => s.at), c.baseNode);
    if (f && opActive(c, 'recrutamento_forcado')) f.units.push(f.units[0]!);
    if (f) out.push(`👁 Batedores avistam: ${forceLabel(f)} saindo de ${node(f.at).name} para ${GOAL_LABEL[f.goal]} em ${node(f.target).name}.`);
  }
  // Crises (C13): várias missões urgentes ao mesmo tempo, com prazo.
  w.nextCrisisDay ??= day + CRISES.everyDays;
  if (day >= w.nextCrisisDay && ch >= 1) {
    w.nextCrisisDay = day + CRISES.everyDays;
    const made = startCrisis(c);
    if (made.length) out.push(`⚠ Crise: ${made.map((m) => m.title).join(' · ')}. Não dá para atender todas.`);
  }
  out.push(...expireCrises(c));
  return out;
}

const CRISIS_TEMPLATES: { victory: Contract['victory']; kind: 'human' | 'beast'; title: string; desc: string; mission?: Contract['mission'] }[] = [
  { victory: 'survive', kind: 'human', title: 'Defender {city}', desc: 'Saqueadores cercam a vila. Resista até a milícia chegar.' },
  { victory: 'escape', kind: 'human', title: 'Resgatar reféns em {city}', desc: 'Leve o refém até a zona de fuga.', mission: 'resgate' },
  { victory: 'target', kind: 'beast', title: 'Fera ataca {city}', desc: 'Abata a fera antes que ela volte.' },
  { victory: 'interact', kind: 'human', title: 'Salvar os celeiros de {city}', desc: 'Recupere os 3 sacos de grãos antes da rodada 8.', mission: 'suprimentos' },
];

/** Abre 2–3 missões urgentes em províncias diferentes do lado do jogador. */
export function startCrisis(c: Campaign): Contract[] {
  const rng = campaignRng(c);
  const ch = chapterOf(c);
  const side = mySide(c);
  const towns = places().filter((n) => (n.type === 'city' || n.type === 'village') && nodeOpen(n, ch) && n.realm === 'reino' && side.includes(provinceState(c, n.id).owner));
  const n = rng.int(CRISES.count[0]!, CRISES.count[1]!);
  const made: Contract[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n && towns.length; i++) {
    const t = rng.pick(towns.filter((x) => !used.has(x.id)).length ? towns.filter((x) => !used.has(x.id)) : towns);
    used.add(t.id);
    const tpl = rng.pick(CRISIS_TEMPLATES);
    const level = Math.max(1, averageLevel(c) + rng.int(0, 2));
    const days = rng.int(CRISES.deadlineDays[0]!, CRISES.deadlineDays[1]!);
    const ct: Contract = {
      id: newContractId(c),
      capitalId: 'crises',
      act: c.act,
      title: `⚠ ${tpl.title.replace('{city}', t.name)}`,
      description: `${tpl.desc} Prazo: ${days} dias; se ninguém for, a província sofre.`,
      victory: tpl.victory,
      targetNode: t.id,
      level,
      enemyKind: tpl.kind,
      mission: tpl.mission,
      rewardGold: 100 + level * 30,
      rewardXp: 50 + level * 12,
      rewardItem: null,
      status: 'accepted',
      squadId: null,
      crisis: true,
      expiresAt: c.hours + days * 24,
    };
    (c.contracts.crises ??= []).push(ct);
    made.push(ct);
  }
  return made;
}

/** Crises vencidas: a província paga o preço. */
export function expireCrises(c: Campaign): string[] {
  const out: string[] = [];
  for (const ct of c.contracts.crises ?? []) {
    if (ct.status === 'done' || !ct.expiresAt || ct.expiresAt > c.hours) continue;
    ct.status = 'done';
    ct.failed = true;
    // Ninguém veio: o povo e o país lembram; os companheiros também.
    addRep(c, 'povo', REP.crisisIgnored);
    addRep(c, node(ct.targetNode).countryId ?? '', REP.crisisIgnored);
    out.push(...reactTo(c, 'crise_ignorada'));
    const st = provinceState(c, ct.targetNode);
    st.fear = Math.min(100, st.fear + CRISES.expireFear);
    st.control = Math.max(0, st.control - CRISES.expireControl);
    out.push(`✖ Ninguém atendeu: ${ct.title.replace('⚠ ', '')}. O medo cresce em ${node(ct.targetNode).name}.`);
    if (ct.defense) out.push(...siegeLost(c, ct.targetNode));
  }
  c.contracts.crises = (c.contracts.crises ?? []).filter((ct) => ct.status !== 'done' || (ct.expiresAt ?? 0) > c.hours - 24 * 5);
  return out;
}

/** Uma força chegou ao alvo: a consequência acontece. */
export function forceArrived(c: Campaign, f: Force): string[] {
  const out: string[] = [];
  const st = provinceState(c, f.target);
  const where = node(f.target).name;
  switch (f.goal) {
    case 'hunt': {
      // Não achou ninguém: vai atrás do esquadrão mais perto ou desiste.
      const s = c.squads.find((x) => !x.to);
      if (s) {
        f.target = s.at;
        routeTo(f, s.at, chapterOf(c));
        return [];
      }
      break;
    }
    case 'raid':
      st.fear = Math.min(100, st.fear + FORCES.raidFear);
      st.control = Math.max(0, st.control - FORCES.raidControl);
      out.push(`🔥 ${forceLabel(f)} saqueou ${where}. O medo cresce.`);
      {
        const lost = raidOutpost(c, f.target);
        if (lost) out.push(lost);
      }
      break;
    case 'altar':
      if (veilActive(c)) {
        const v = ensureVeil(c);
        v.value = Math.min(100, v.value + FORCES.altarVeil);
        out.push(`🜏 O culto ergueu um altar em ${where}: o Véu avança (${v.value}/100).`);
      } else {
        st.fear = Math.min(100, st.fear + FORCES.raidFear / 2);
        out.push(`🜏 Cultistas fizeram um rito em ${where}. Os moradores estão assustados.`);
      }
      break;
    case 'abduct':
      st.fear = Math.min(100, st.fear + FORCES.raidFear);
      st.control = Math.max(0, st.control - FORCES.raidControl);
      c.abducted = (c.abducted ?? 0) + 10 + campaignRng(c).int(0, 20);
      out.push(`🌀 Uma incursão levou moradores de ${where} (${c.abducted} desaparecidos no total).`);
      break;
    case 'siege': {
      const ct = defenseContract(c, f);
      out.push(`⚔ ${forceLabel(f)} cerca ${where}! Defesa em até ${Math.round(FORCES.siegeHours / 24)} dias (${ct.title}).`);
      break;
    }
  }
  removeForce(c, f.id);
  return out;
}

/** Cerco: missão de defesa com prazo; perder faz a província (ou a base) cair. */
export function defenseContract(c: Campaign, f: Force): Contract {
  const ct: Contract = {
    id: newContractId(c),
    capitalId: 'crises',
    act: c.act,
    title: `🛡 Defender ${node(f.target).name} do cerco`,
    description: `${forceLabel(f)} cerca o lugar. Segure as muralhas por 8 rodadas; se ninguém vier, ${node(f.target).name} cai.`,
    victory: 'survive',
    targetNode: f.target,
    level: f.level,
    enemyKind: 'human',
    rewardGold: 150 + f.level * 40,
    rewardXp: 80 + f.level * 15,
    rewardItem: null,
    status: 'accepted',
    squadId: null,
    crisis: true,
    defense: true,
    forceUnits: f.units,
    expiresAt: c.hours + FORCES.siegeHours,
  };
  (c.contracts.crises ??= []).push(ct);
  return ct;
}

/** Cerco perdido: a província troca de dono; se era a base, uma instalação fica fora de uso por um mês. */
export function siegeLost(c: Campaign, nodeId: string): string[] {
  const out: string[] = [];
  const to = threatOwner(c);
  setOwner(c, nodeId, to);
  provinceLostPolitics(c, nodeId, out);
  out.push(`🏴 ${node(nodeId).name} caiu no cerco (agora da ${OWNER_LABEL[to]}).`);
  if (nodeId === c.baseNode && c.base) {
    c.base.damagedUntil = c.hours + 24 * 30;
    out.push('🏚 A base foi saqueada: pesquisa e forja param por um mês.');
  }
  return out;
}

/** Resultado de uma batalha numa província: vitória acalma e firma o controle; derrota assusta. */
export function battleInProvince(c: Campaign, nodeId: string, victory: boolean): void {
  const st = provinceState(c, nodeId);
  if (victory) {
    st.fear = Math.max(0, st.fear - T.victoryFear);
    if (mySide(c).includes(st.owner)) st.control = Math.min(100, st.control + T.victoryControl);
  } else st.fear = Math.min(100, st.fear + T.defeatFear);
}

/** Fim do mês: renda das províncias do lado do jogador. Devolve as linhas do relatório. */
export function commanderMonth(c: Campaign): string[] {
  const w = ensureWorld(c);
  const side = mySide(c);
  const mine = Object.entries(w.provinces).filter(([id, st]) => side.includes(st.owner) && st.owner !== 'livre' && node(id).realm === 'reino');
  const capitals = mine.filter(([id]) => node(id).type === 'capital' || node(id).type === 'citadel').length;
  const gold = Math.round(mine.reduce((a, [, st]) => a + T.incomePerProvince * (0.5 + st.control / 100), 0) + capitals * T.capitalIncome);
  c.gold += gold;
  const lines = [`💰 Renda de ${mine.length} província(s) aliadas: +${gold} ouro.`];
  const hot = Object.entries(w.provinces)
    .filter(([id, st]) => st.fear >= 60 && side.includes(st.owner) && nodeOpen(node(id), chapterOf(c)))
    .map(([id]) => node(id).name);
  if (hot.length) lines.push(`🔥 Medo alto em: ${hot.join(', ')}.`);
  const lost = Object.values(w.provinces).filter((st) => !side.includes(st.owner) && st.owner !== 'livre').length;
  lines.push(`🗺 Províncias nas mãos do inimigo: ${lost}.`);
  for (const l of lines) addLog(c, l);
  return lines;
}

/** Província perdida: o país e os companheiros cobram. */
function provinceLostPolitics(c: Campaign, id: string, out: string[]): void {
  addRep(c, node(id).countryId ?? '', REP.provinceLost);
  out.push(...reactTo(c, 'provincia_perdida'));
}

/**
 * Política do dia: reações às marcas novas da história, informação da rede de informantes,
 * planos do inimigo em vigor (boatos de terror, ritual da lua).
 */
export function politicsDay(c: Campaign): string[] {
  const out = politicsFromFlags(c);
  if (c.base?.facilities.includes('rede_informantes')) addIntel(c, RES.intelPerDayNetwork);
  if (opActive(c, 'medo_espalhado')) for (const st of Object.values(ensureWorld(c).provinces)) st.fear = Math.min(100, st.fear + OPS.list.medo_espalhado.fearPerDay);
  if (opActive(c, 'ritual_da_lua') && veilActive(c)) {
    const v = ensureVeil(c);
    v.value = Math.min(99, v.value + OPS.list.ritual_da_lua.veilPerDay);
  }
  return out;
}

/** Contrato cumprido: reputação, influência e aprovação (C15/C16/C20); plano do inimigo frustrado. */
export function contractDonePolitics(c: Campaign, ct: Contract): string[] {
  const out: string[] = [];
  if (ct.crisis) {
    addRep(c, 'povo', REP.crisisDone);
    addRep(c, node(ct.targetNode).countryId ?? '', REP.crisisDone);
    addInfluence(c, RES.influenceCrisis);
    out.push(...reactTo(c, 'crise_atendida'));
  } else if (ct.board) addRep(c, ct.board, REP.contractDone);
  else addRep(c, node(ct.capitalId === 'crises' ? ct.targetNode : ct.capitalId).countryId ?? '', REP.contractDone);
  if (ct.opId) {
    const op = ensurePolitics(c).proposed.find((o) => o.id === ct.opId);
    if (op) {
      op.foiled = true;
      op.countering = false;
      out.push(`✔ Plano frustrado: ${OPS.list[op.id].label}.`);
    }
  }
  return out;
}

/** Abre a missão para frustrar um plano proposto (até o fim do mês). */
export function counterOp(c: Campaign, idx: number): Contract | null {
  const p = ensurePolitics(c);
  const op = p.proposed[idx];
  if (!op || op.countering || op.foiled || counterSlotsLeft(c) <= 0) return null;
  const rng = campaignRng(c);
  const ch = chapterOf(c);
  const towns = places().filter((n) => n.realm === 'reino' && (n.type === 'city' || n.type === 'capital') && nodeOpen(n, ch));
  const t = rng.pick(towns);
  const level = Math.max(1, averageLevel(c) + 2);
  const monthEnd = (Math.floor(c.hours / (24 * 30)) + 1) * 24 * 30;
  const ct: Contract = {
    id: newContractId(c),
    capitalId: 'crises',
    act: c.act,
    title: `🜏 Frustrar: ${OPS.list[op.id].label} (${t.name})`,
    description: `Desmonte o plano antes do fim do mês. Se ele entrar em vigor: ${OPS.list[op.id].text}`,
    victory: 'interact',
    targetNode: t.id,
    level,
    enemyKind: 'human',
    mission: 'roubo',
    rewardGold: 80 + level * 25,
    rewardXp: 60 + level * 12,
    rewardItem: null,
    status: 'accepted',
    squadId: null,
    crisis: true,
    expiresAt: monthEnd,
    opId: op.id,
  };
  (c.contracts.crises ??= []).push(ct);
  op.countering = true;
  return ct;
}

/** Ordem de interceptar: o esquadrão vai até o próximo ponto da força. */
export function interceptTarget(f: Force): string {
  return f.to ?? f.at;
}

export { province, delayVeil };
