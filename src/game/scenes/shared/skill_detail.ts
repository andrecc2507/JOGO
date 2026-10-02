import { btn, h, toast } from '@ui/dom';
import { nodeOfSkill, skill } from '../../data';
import { describeSkill } from '../../bestiary/describe';
import { learnSkill, type Character } from '../../rules/character';
import { SKILL_MAX_RANK, lockReason, rankMult, rankOf } from '../../rules/skill_tree';

const BONUS_LABEL: Record<string, string> = { hp: 'HP', mp: 'MP', accuracy: 'acerto', speed: 'velocidade', magic: 'dano mágico', str: 'Força', dex: 'Destreza', int: 'Inteligência' };

/** Painel da habilidade escolhida na teia: nível, efeito, motivo do bloqueio e o botão de aprender/fortalecer. */
export function skillDetail(ch: Character, id: string | null, render: () => void): HTMLElement {
  const box = h('div', { class: 'item col', style: 'font-size:12px' });
  if (!id) {
    box.append(h('div', { class: 'muted', text: 'Clique numa habilidade da teia. Cada ponto ganho em batalha aprende uma habilidade (Nv 1) ou a fortalece, até o Nv 5.' }));
    return box;
  }
  const sk = skill(id);
  const node = nodeOfSkill(id);
  const rank = rankOf(ch, id);
  const why = lockReason(ch, id);
  const bonus = node ? [node.mpBonus ? `+${node.mpBonus} MP` : '', ...Object.entries(node.bonus ?? {}).filter(([, v]) => v).map(([k, v]) => `+${Math.round(v! * 100)}% ${BONUS_LABEL[k] ?? k}`)].filter(Boolean).join(' · ') : '';
  const pct = (r: number) => `${Math.round(rankMult(r) * 100)}%`;
  box.append(
    h('b', { class: sk.ultimate ? 'gold' : '', text: `${sk.ultimate ? '★ ' : ''}${sk.name}` }),
    h('div', { class: 'muted', text: `${node?.name ?? ''}${sk.mp ? ` · ${sk.mp} MP` : ''} · Nv ${rank}/${SKILL_MAX_RANK}` }),
    h('div', { text: sk.description }),
    node?.skills.some((s) => s.grantedBy === id) ? h('div', { class: 'gold', text: `Libera: ${node.skills.filter((s) => s.grantedBy === id).map((s) => s.name).join(', ')}` }) : '',
    node ? h('div', { class: 'muted', text: describeSkill(node.skills.find((s) => s.id === id)!) }) : '',
    h('div', { class: 'muted', text: rank ? `Poder atual ${pct(rank)}${rank < SKILL_MAX_RANK ? ` → ${pct(rank + 1)} no Nv ${rank + 1}` : ' (máximo)'}` : `Poder: Nv 1 ${pct(1)} · Nv ${SKILL_MAX_RANK} ${pct(SKILL_MAX_RANK)}` }),
    bonus && !ch.skills.some((s) => node?.skills.some((x) => x.id === s)) ? h('div', { class: 'gold', text: `1ª habilidade de ${node?.name}: ${bonus}` }) : '',
    why && why !== 'nível máximo'
      ? h('div', { style: 'color:#e57373', text: `🔒 ${why}` })
      : rank >= SKILL_MAX_RANK
        ? h('div', { class: 'gold', text: 'Nível máximo.' })
        : btn(rank ? `Fortalecer → Nv ${rank + 1} (1 ponto)` : 'Aprender (1 ponto)', () => {
            learnSkill(ch, id);
            // Segredo do treino: no Nv 5 a habilidade desperta a forma fortificada.
            if (rankOf(ch, id) >= SKILL_MAX_RANK && sk.fortified) toast(`✦ ${sk.name} transcendeu! De tanto treino, o golpe mudou de forma: ${sk.fortifiedBonus}.`, 5200);
            render();
          }, { class: 'primary', disabled: ch.skillPoints < 1 }),
    rank >= SKILL_MAX_RANK && sk.fortified
      ? h('div', { style: 'margin-top:4px;padding:6px;border:1px solid #c9a14a;border-radius:4px;background:rgba(201,161,74,0.1)' },
          h('b', { class: 'gold', text: '✦ Forma fortificada' }),
          h('div', { text: `${sk.fortifiedBonus}. Custa ${skill(sk.fortified).mp} MP; na batalha aparece ao lado da versão normal.` }),
        )
      : '',
  );
  return box;
}

