/**
 * Define o orbe (joia de habilidade) de cada criatura do bestiário e ajusta as habilidades
 * que viraram orbes (docs/design/orbes.md). Rodar uma vez: `node tools/define_orbs.cjs`.
 * Idempotente: rodar de novo não duplica habilidades.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../src/game/data/bestiary/creatures.json');
const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const byId = Object.fromEntries(list.map((c) => [c.id, c]));

function creature(id) {
  const c = byId[id];
  if (!c) throw new Error(`criatura não encontrada: ${id}`);
  return c;
}

/** Ajusta uma habilidade existente (campos de topo substituídos; `fx` substitui o bloco inteiro se dado). */
function edit(cid, sid, patch) {
  const s = creature(cid).skills.find((x) => x.id === sid);
  if (!s) throw new Error(`habilidade não encontrada: ${cid}/${sid}`);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete s[k];
    else s[k] = v;
  }
  return s;
}

/** Acrescenta uma habilidade nova (ou substitui a de mesmo id). */
function add(cid, skill) {
  const c = creature(cid);
  const i = c.skills.findIndex((x) => x.id === skill.id);
  const full = { range: 0, power: 0, cooldown: 0, ...skill };
  if (i >= 0) c.skills[i] = full;
  else c.skills.push(full);
  return full;
}

const orbs = {};
/** Marca a habilidade como o orbe da criatura. */
function orb(cid, sid) {
  if (!creature(cid).skills.some((x) => x.id === sid)) throw new Error(`orbe sem habilidade: ${cid}/${sid}`);
  orbs[cid] = sid;
}

// ───────────────────────────── Floresta ─────────────────────────────

orb('esquilo_farpa', 'acrobacia_arborea');
edit('esquilo_farpa', 'acrobacia_arborea', { description: 'Passiva: +20 de esquiva com uma árvore ao lado.' });

add('cervo_da_folha', { id: 'salto_aprimorado', name: 'Salto Aprimorado', description: 'Passiva: salta desníveis de até 5 de altura.', kind: 'passive', fx: { jumpTo: 5 } });
orb('cervo_da_folha', 'salto_aprimorado');

orb('javali_casca_grossa', 'furia_cega');
edit('javali_casca_grossa', 'furia_cega', { description: 'Passiva: abaixo de metade da vida, seus ataques causam 40% mais dano.' });

edit('texugo_da_nevoa', 'cortina_fetida', {
  description: 'Fumaça: libera um gás cinzento (raio 2) que cega quem estiver dentro. O gás anda 1 casa por turno seu, na direção que você escolher.',
  fx: { noDamage: true, cloud: 'gas_fetido' },
});
orb('texugo_da_nevoa', 'cortina_fetida');

edit('coruja_silenciosa', 'pio_atordoante', {
  description: 'Som agudo que quebra a concentração: interrompe magias em preparo e silencia o alvo por 1 turno.',
  fx: { interrupt: true },
});
orb('coruja_silenciosa', 'pio_atordoante');

edit('vibora_cipo', 'toxina_paralisante', {
  description: 'Buff: o próximo golpe (ataque ou habilidade) injeta veneno e deixa o alvo Lento por 2 turnos.',
  kind: 'utility', range: 0, power: 0, cooldown: 3, status: undefined, target: 'self',
  fx: { imbue: { turns: 3, charges: 1, status: { id: 'lento', turns: 2 }, element: 'veneno' } },
});
orb('vibora_cipo', 'toxina_paralisante');

add('raposa_do_liquen', { id: 'passo_veloz', name: 'Veloz', description: 'Passiva: anda sem provocar ataques de oportunidade nem perseguição.', kind: 'passive', fx: { noOpportunity: true } });
orb('raposa_do_liquen', 'passo_veloz');

orb('aranha_tecer_teia', 'disparar_teia');
edit('aranha_tecer_teia', 'disparar_teia', { description: 'Lança teias pegajosas que prendem os pés do alvo no chão (Imobilizado por 2 turnos).' });

orb('urso_pardo_das_cavas', 'rugido_intimidador');
edit('urso_pardo_das_cavas', 'rugido_intimidador', { description: 'Rugido em raio 3: os inimigos ficam Apavorados por 1 turno (não atacam).', fx: { noDamage: true, spareAllies: true } });

orb('lobo_da_silvia', 'tatica_de_flanqueio');
edit('lobo_da_silvia', 'tatica_de_flanqueio', { description: 'Passiva: +30% de dano se outro aliado estiver colado no mesmo alvo.' });

edit('silfideo_do_ambar', 'camuflagem_de_folhas', {
  description: 'Passiva: desaparece de vista assim que encosta num arbusto ou árvore.',
  kind: 'passive', range: 0, cooldown: 0, fx: { autoHide: 'bush' },
});
orb('silfideo_do_ambar', 'camuflagem_de_folhas');

edit('urso_chifre', 'armadura_de_musgo', {
  description: 'Buff: por 3 turnos, recupera 8% da vida no início de cada turno se não foi atingido na rodada.',
  kind: 'utility', cooldown: 4, target: 'self', fx: { self: { id: 'musgo', turns: 3 } },
});
orb('urso_chifre', 'armadura_de_musgo');

edit('fada_lamparina', 'flash_ofuscante', { description: 'Clarão intenso em raio 2: cega todos os inimigos ao redor (aliados não são afetados).', fx: { spareAllies: true } });
orb('fada_lamparina', 'flash_ofuscante');

edit('fungo_caminhante', 'nuvem_de_esporos', {
  description: 'Fumaça: esporos (raio 2) que deixam Confuso quem estiver dentro — os golpes podem acertar os próprios aliados. Anda 1 casa por turno seu.',
  fx: { noDamage: true, cloud: 'esporos' },
});
orb('fungo_caminhante', 'nuvem_de_esporos');

orb('gato_de_musgo', 'purificacao_natural');
edit('gato_de_musgo', 'purificacao_natural', { description: 'Remove todos os efeitos negativos de si mesmo.' });

edit('fantasmas_da_copa', 'gargalhada_ecoante', {
  description: 'Gargalhada em raio 3: drena 8 de mana dos inimigos e os deixa Apavorados por 1 turno.',
  fx: { noDamage: true, mpBurn: 8, also: [{ id: 'medo', turns: 1 }], spareAllies: true },
});
orb('fantasmas_da_copa', 'gargalhada_ecoante');

orb('cao_feerico', 'uivo_sincronizado');
edit('cao_feerico', 'uivo_sincronizado', { description: 'Uivo em raio 4: os aliados ficam Velozes por 2 turnos (barra de ação mais rápida e +2 m).' });

orb('ent_guardiao', 'coracao_da_floresta');
edit('ent_guardiao', 'coracao_da_floresta', { description: 'Passiva: ao cair, vira uma semente protegida por casca. Se não for destruída em 3 rodadas, renasce com 50% da vida (uma vez por batalha).' });

add('quimera_da_mata', {
  id: 'veneno_mortal', name: 'Veneno Mortal',
  description: 'Picada da cauda de cobra: condena o alvo, que morre no início do 3º turno dele se o veneno não for curado (antídoto ou purificação). Lendários e chefes são imunes.',
  kind: 'physical', range: 1, power: 4, cooldown: 6, status: { id: 'condenado', turns: 3 },
});
orb('quimera_da_mata', 'veneno_mortal');

orb('aracne_mae', 'fios_do_destino');
edit('aracne_mae', 'fios_do_destino', { description: 'Liga sua vida aos 2 inimigos mais próximos: o dano que você sofre é dividido com eles. Os fios rompem se eles se afastarem demais um do outro.' });

edit('lobo_guara_gigante', 'predador_da_lua', {
  description: 'Aura de névoa escura (raio 2) que o acompanha por 3 turnos: inimigos dentro ficam cegos e erram muito contra ele; ele enxerga normalmente e ganha +50% de crítico dentro dela.',
  kind: 'magic', range: 0, radius: 2, shape: 'radius', cooldown: 5, status: { id: 'cegado', turns: 1 },
  fx: { noDamage: true, spareAllies: true, cloud: 'nevoa_lunar', cloudFollow: 3 },
});
orb('lobo_guara_gigante', 'predador_da_lua');

edit('coruja_da_lua', 'olhar_hipnotico', {
  description: 'Sem custo de ação: atordoa um inimigo que esteja olhando para ela.',
  fx: { noDamage: true, free: true, facingOnly: true },
});
orb('coruja_da_lua', 'olhar_hipnotico');

orb('vibora_das_sombras', 'veneno_do_eclipse');
edit('vibora_das_sombras', 'veneno_do_eclipse', { description: 'Mordida cujo veneno apaga a visão: Cegado por 3 turnos e envenenado.' });

orb('anciao_verde', 'fusao_com_a_mata');
edit('anciao_verde', 'fusao_com_a_mata', { description: 'Funde-se à mata: some de vista e regenera 8% da vida por turno durante 3 turnos.' });

edit('dragao_da_clareira', 'drenagem_vital_de_raiz', {
  description: 'Finca as garras na terra: drena vida e reforços dos inimigos em raio 2 (5×5) e transforma o dano em escudo de vida.',
  radius: 2,
});
orb('dragao_da_clareira', 'drenagem_vital_de_raiz');

// ───────────────────────────── Planície ─────────────────────────────

edit('lebre_da_grama', 'audicao_agucada', {
  description: 'Passiva: nunca é pega de surpresa — enxerga escondidos, golpes de esconderijo ou pelas costas não ganham bônus contra ela, e o esquadrão não sofre emboscadas.',
  fx: { seeHidden: true, noSurprise: true },
});
orb('lebre_da_grama', 'audicao_agucada');

orb('cachorro_da_pradaria', 'assobio_de_alerta');
edit('cachorro_da_pradaria', 'assobio_de_alerta', { description: 'Assobio em raio 3: os aliados ficam Fortificados (+50% de defesa) por 2 turnos.' });

edit('falcao_cacador', 'grito_agudo', { description: 'Grito agudo: interrompe magias em preparo e silencia o alvo por 1 turno.', fx: { noDamage: true, interrupt: true } });
orb('falcao_cacador', 'grito_agudo');

orb('cavalo_selvagem', 'relincho_desafiador');
edit('cavalo_selvagem', 'relincho_desafiador', { description: 'Fica Veloz por 2 turnos (barra de ação mais rápida e +2 m).' });

orb('antilocapra_velo', 'salto_de_longa_distancia');
edit('antilocapra_velo', 'salto_de_longa_distancia', { description: 'Salta por cima de tudo e de todos até um ponto a 6 casas.' });

orb('coiote_das_estepes', 'uivo_de_caca');
edit('coiote_das_estepes', 'uivo_de_caca', { description: 'Uivo em raio 4: os aliados ficam Afiados (+25% de crítico) por 2 turnos.' });

edit('abutre_cinzento', 'sentir_a_morte', {
  description: 'Passiva: +10% de dano contra o inimigo com menos vida (não vale se só resta um).',
  fx: { focusWeak: true, vsWeakest: 0.1 },
});
orb('abutre_cinzento', 'sentir_a_morte');

orb('furao_dos_campos', 'corpo_flexivel');
edit('furao_dos_campos', 'corpo_flexivel', { description: 'Reação: o corpo flexível escapa de golpes críticos.' });

edit('touro_galo', 'carapaca_de_bisao', { description: 'Passiva: a pele frontal reduz em 50% o dano de ataques à distância vindos da frente.', fx: { frontGuard: 0.5 } });
orb('touro_galo', 'carapaca_de_bisao');

orb('ra_saltadora', 'pele_escorregadia');
edit('ra_saltadora', 'pele_escorregadia', { description: 'Passiva: imune a ser agarrada, imobilizada ou aprisionada.' });

orb('gato_de_chifre', 'cerco_veloz');
edit('gato_de_chifre', 'cerco_veloz', { description: 'Gira em volta do alvo criando ilusões de velocidade: +30 de esquiva até o próximo turno ou até o verdadeiro ser golpeado.' });

edit('espantalho_anciao', 'foice_maldita', {
  description: 'Buff: o próximo ataque ou magia carrega energia maldita — o alvo não recebe cura por 3 turnos.',
  kind: 'utility', range: 0, power: 0, cooldown: 3, status: undefined, target: 'self',
  fx: { imbue: { turns: 3, charges: 1, status: { id: 'ferida_aberta', turns: 3 } } },
});
orb('espantalho_anciao', 'foice_maldita');

edit('rinoceronte_da_grama', 'carga_terrestre', {
  description: 'Investida em linha que derruba paredes, obstáculos e barreiras mágicas (remove escudos e reforços de quem for atingido).',
  fx: { dispel: true, destroyProps: true },
});
orb('rinoceronte_da_grama', 'carga_terrestre');

add('centauro_nomade', { id: 'velocidade_maxima', name: 'Velocidade Máxima', description: 'Sem custo de ação: ganha mais um deslocamento completo neste turno.', kind: 'utility', cooldown: 3, target: 'self', fx: { free: true, extraMove: true } });
orb('centauro_nomade', 'velocidade_maxima');

orb('vibora_relampago', 'rastro_eletrico');
edit('vibora_relampago', 'rastro_eletrico', { description: 'Passiva: estática na pele — a cada rodada, inimigos colados ficam Eletrocutados e sofrem 3% da vida em dano.' });

orb('cavalinho_de_vento', 'forma_intangivel');
edit('cavalinho_de_vento', 'forma_intangivel', { description: 'Vira pura brisa: imune a dano físico por 1 turno.' });

orb('fada_dos_campos', 'poeira_do_riso');
edit('fada_dos_campos', 'poeira_do_riso', { description: 'O alvo cai na gargalhada e perde os ataques físicos por 1 turno.' });

edit('cao_de_corte', 'salto_cortante', {
  description: 'Salta em linha até um ponto a 5 casas (vence até 3 de altura), rasgando com as garras todo inimigo no caminho.',
  kind: 'physical', range: 5, power: 6, cooldown: 2, target: 'tile', fx: { dashThrough: true },
});
orb('cao_de_corte', 'salto_cortante');

orb('manticora_das_estepes', 'rugido_de_leao');
edit('manticora_das_estepes', 'rugido_de_leao', { description: 'Rugido em raio 3: atordoa todos os inimigos da área.', fx: { noDamage: true, spareAllies: true } });

orb('gorgona_errante', 'reflexo_condenado');
edit('gorgona_errante', 'reflexo_condenado', { description: 'Reação: espelhos de sal flutuantes — 50% de chance de um golpe bater num espelho e voltar inteiro para quem atacou (até 3 por rodada).' });

orb('passaro_trovao_menor', 'sobrecarga_de_estatica');
edit('passaro_trovao_menor', 'sobrecarga_de_estatica', { description: 'Magnetiza dois inimigos com cargas opostas: ficam Eletrocutados e Marcados (a marca explode ao acabar).' });

edit('bisao_monstro', 'pele_impenetravel', { description: 'Passiva: reduz em 75% o dano de flechas, adagas e golpes perfurantes.', fx: { pierceGuard: 0.75 } });
orb('bisao_monstro', 'pele_impenetravel');

edit('espirito_do_trigo', 'reabsorcao_de_nutrientes', { description: 'Sem custo de ação: suga a energia do solo e recupera 15% da vida.', fx: { healPct: 0.15, free: true } });
orb('espirito_do_trigo', 'reabsorcao_de_nutrientes');

orb('corredor_do_horizonte', 'dilema_do_tempo');
edit('corredor_do_horizonte', 'dilema_do_tempo', { description: 'Desacelera o tempo de todos os inimigos menos um, sorteado: os outros ficam Lentos por 2 turnos e esse um enfrenta você sozinho.' });

edit('quirin_da_alvorada', 'salto_solar', { description: 'Sem custo de ação: teleporta-se num feixe de luz para qualquer ponto a até 10 casas.', fx: { teleport: true, free: true } });
orb('quirin_da_alvorada', 'salto_solar');

// ───────────────────────────── Neve ─────────────────────────────

orb('lebre_artica', 'velocidade_branca');
edit('lebre_artica', 'velocidade_branca', { description: 'Passiva: +25 de esquiva sobre neve ou gelo.' });

orb('raposa_do_gelo', 'audicao_subterranea');
edit('raposa_do_gelo', 'audicao_subterranea', { description: 'Passiva: guia-se pelo som dos passos — enxerga e ataca normalmente alvos escondidos ou invisíveis.' });

add('coruja_das_neves', {
  id: 'nevasca_branda', name: 'Nevasca Branda',
  description: 'Fumaça: cria uma nevasca (raio 1) que deixa Lento quem estiver dentro. Anda 1 casa por turno seu, na direção que você escolher.',
  kind: 'magic', range: 5, power: 0, cooldown: 3, radius: 1, shape: 'radius', target: 'tile', element: 'gelo',
  status: { id: 'lento', turns: 1 }, fx: { noDamage: true, cloud: 'nevasca' },
});
orb('coruja_das_neves', 'nevasca_branda');

orb('pinguim_imperador', 'grito_de_bando');
edit('pinguim_imperador', 'grito_de_bando', { description: 'Grito de bando: os aliados colados ficam Fortificados (+50% de defesa) por 2 turnos.' });

edit('arminho_da_neve', 'frenesi_sangrento', {
  description: 'Ataca normalmente; se o alvo estiver abaixo de 30% da vida, recupera 25% da barra de ação.',
  power: 4, fx: { gaugeRefund: { below: 0.3, pct: 25 } },
});
orb('arminho_da_neve', 'frenesi_sangrento');

orb('caribu_da_tundra', 'resistencia_ao_frio');
edit('caribu_da_tundra', 'resistencia_ao_frio', { description: 'Passiva: imune a Lento e Congelado.' });

edit('leopardo_das_neves', 'bote_das_alturas', {
  description: 'Salta sobre a presa (até 5 casas) e cai ao lado dela; vindo de um ponto mais alto que o alvo, causa 150% de dano.',
  fx: { leap: true, fromAbove: 1.5 },
});
orb('leopardo_das_neves', 'bote_das_alturas');

edit('morsa_presa_de_ferro', 'golpe_de_presa', {
  description: 'As presas de ferro rasgam escudos: destrói escudos de vida e proteção do alvo, remove reforços e quebra a armadura.',
  fx: { dispel: true, breakShield: true },
});
orb('morsa_presa_de_ferro', 'golpe_de_presa');

edit('lobo_cinzento_do_norte', 'perseguicao_implacavel', {
  description: 'Passiva: golpeia quem foge do lado dele e ganha +1 m de movimento no próximo turno a cada 2 m que o alvo fugir.',
  fx: { pursuit: true, chase: true },
});
orb('lobo_cinzento_do_norte', 'perseguicao_implacavel');

orb('foca_leopardo', 'mordida_arrastante');
edit('foca_leopardo', 'mordida_arrastante', { description: 'Morde, agarra e arrasta o alvo 1 casa para perto.' });

edit('uivador_do_gelo', 'passo_invernal', {
  description: 'Ergue uma ponte de gelo em escada (2 casas: +1 e +2 de altura) por 3 turnos — degrau e cobertura. Quem estiver em cima quando ela derrete cai e se fere.',
  kind: 'utility', range: 3, power: 0, cooldown: 4, target: 'tile', fx: { iceBridge: true },
});
orb('uivador_do_gelo', 'passo_invernal');

edit('espectro_da_nevasca', 'toque_arrepiante', {
  description: 'Atravessa o peito do alvo: queima 6 de mana e corta 25% da mana máxima dele até o fim da batalha.',
  fx: { mpBurn: 6, maxMpCut: 0.25 },
});
orb('espectro_da_nevasca', 'toque_arrepiante');

edit('golem_de_gelo', 'runas_de_protecao', { description: 'Sem custo de ação: runas no peito anulam todo dano mágico por 2 turnos.', fx: { self: { id: 'runico', turns: 2 }, free: true } });
orb('golem_de_gelo', 'runas_de_protecao');

orb('fada_do_gelo', 'riso_agudo');
edit('fada_do_gelo', 'riso_agudo', { description: 'Riso agudo em raio 3: os inimigos ficam Confusos por 2 turnos — trocam de alvo e podem acertar os próprios aliados.', fx: { noDamage: true, spareAllies: true } });

edit('serpente_da_geada', 'sopro_de_neve', { description: 'Rajada de vento frio em cone: cega quem estiver olhando de frente para ela.', fx: { facingOnly: true } });
orb('serpente_da_geada', 'sopro_de_neve');

orb('urso_polar_runico', 'carapaca_runica');
edit('urso_polar_runico', 'carapaca_runica', { description: 'Passiva: magias de gelo o curam em vez de ferir; outras magias causam 30% menos dano.' });

orb('cao_da_tundra', 'halito_crio_genico');
edit('cao_da_tundra', 'halito_crio_genico', { description: 'Sopro frio focado em cone: trava as pernas do inimigo no chão (Imobilizado).' });

edit('espirito_lanterna_azul', 'fogo_frio', {
  description: 'Zona de chama azul (raio 1) que queima a mana de quem está dentro em vez da vida. Anda 1 casa por turno seu.',
  range: 5, radius: 1, shape: 'radius', target: 'tile', cooldown: 3, fx: { mpBurn: 10, cloud: 'chama_fria' },
});
orb('espirito_lanterna_azul', 'fogo_frio');

edit('yeti', 'furia_branca', { description: 'Passiva: a barra de ação enche cada vez mais rápido conforme perde vida (até +80% perto do fim).', fx: { furyHaste: 0.8 } });
orb('yeti', 'furia_branca');

edit('wyvern_da_geada', 'vento_artico', {
  description: 'Bate as asas num cone de ar gelado: empurra, deixa Lento, tem 30% de chance de congelar e cobre o chão de gelo.',
  fx: { push: 2, surface: 'geada', also: [{ id: 'lento', turns: 2 }, { id: 'congelado', turns: 1, chance: 30 }] },
});
orb('wyvern_da_geada', 'vento_artico');

edit('remorhaz_menor', 'erupcao_de_vapor', {
  description: 'Fumaça: nuvem de vapor fervente (raio 2) que queima quem estiver dentro; quem a criou enxerga normalmente nela. Anda 1 casa por turno seu.',
  fx: { also: [{ id: 'cegado', turns: 1 }], cloud: 'vapor_fervente' },
});
orb('remorhaz_menor', 'erupcao_de_vapor');

orb('caminhante_das_montanhas', 'celula_de_congelamento');
edit('caminhante_das_montanhas', 'celula_de_congelamento', { description: 'Isola um inimigo numa prisão de gelo: ele não age e sofre dano de frio até ser libertado (um golpe forte no captor quebra a cela).' });

edit('mamute_runico', 'barreira_runica_de_gelo', {
  description: 'Reação: anula um ataque à distância erguendo uma parede de cristais de gelo na direção de quem atirou (até 2 por rodada).',
  kind: 'reaction', range: 0, power: 0, cooldown: 0, react: { on: 'ranged', do: 'icewall', perRound: 2 }, fx: undefined,
});
orb('mamute_runico', 'barreira_runica_de_gelo');

orb('cryon', 'o_olho_da_tempestade');
edit('cryon', 'o_olho_da_tempestade', { description: 'Invoca uma nevasca sobre o mapa inteiro por 3 rodadas, menos num círculo pequeno que se move (o olho). Inimigos fora do olho sofrem frio a cada rodada.' });

orb('skadi', 'sangue_congelado');
edit('skadi', 'sangue_congelado', { description: 'Passiva: ao cair abaixo de metade da vida, o sangue congela o chão em volta em poças de gelo afiadas.' });

// ───────────────────────────── Deserto ─────────────────────────────

orb('rato_canguru', 'salto_de_esquiva');
edit('rato_canguru', 'salto_de_esquiva', { description: 'Reação: salta para longe de um golpe corpo a corpo.' });

orb('vibora_chifruda', 'toxina_desidratante');
edit('vibora_chifruda', 'toxina_desidratante', { description: 'Veneno que resseca: envenena por 3 turnos e queima 6 de mana.' });

orb('lagarto_armado', 'carapaca_espinhosa');
edit('lagarto_armado', 'carapaca_espinhosa', { description: 'Reação: quem o golpeia corpo a corpo se fere nos espinhos (até 3 por rodada).' });

orb('falcao_do_deserto', 'ataque_termico');
edit('falcao_do_deserto', 'ataque_termico', { description: 'Mergulha numa corrente de ar quente sobre um alvo a até 6 casas.' });

add('camelo_de_guerra', { id: 'corcova_de_reserva', name: 'Corcova de Reserva', description: 'Passiva: com pouca vida, a água guardada na corcova o regenera 6% por turno.', kind: 'passive', fx: { regen: 0.06, when: 'low_hp' } });
orb('camelo_de_guerra', 'corcova_de_reserva');

orb('escorpiao_da_areia', 'injecao_de_toxina');
edit('escorpiao_da_areia', 'injecao_de_toxina', { description: 'Ferroada que paralisa (Imobilizado por 1 turno) e envenena por 3 turnos.' });

orb('raposa_feneco', 'mordida_de_distracao');
edit('raposa_feneco', 'mordida_de_distracao', { description: 'Mordida rápida que distrai: o alvo fica Silenciado por 1 turno.' });

orb('abutre_do_sol', 'foco_no_fraco');
edit('abutre_do_sol', 'foco_no_fraco', { description: 'Passiva: +50% de dano contra alvos quase mortos (abaixo de 30% da vida) ou sem mana.' });

orb('hiena_panda', 'risada_histerica');
edit('hiena_panda', 'risada_histerica', { description: 'Risada em raio 3 que abala a guarda dos inimigos: armadura quebrada por 2 turnos.', fx: { noDamage: true, spareAllies: true } });

orb('tarantula_das_dunas', 'bote_do_alcapao');
edit('tarantula_das_dunas', 'bote_do_alcapao', { description: 'Puxa o alvo 2 casas para perto e o imobiliza; vindo do esconderijo, +50% de dano.' });

orb('escorpiao_obsidiana', 'carapaca_espelhada');
edit('escorpiao_obsidiana', 'carapaca_espelhada', { description: 'Reação: a carapaça de vidro devolve a magia recebida para quem a lançou.' });

orb('nomades_de_poeira', 'forma_de_turbilhao');
edit('nomades_de_poeira', 'forma_de_turbilhao', { description: 'Reação: vira um turbilhão de areia e anula um golpe físico.' });

orb('serpente_do_sol', 'brilho_solar');
edit('serpente_do_sol', 'brilho_solar', { description: 'Brilho solar em raio 2: cega e queima os inimigos ao redor.', fx: { also: [{ id: 'queimando', turns: 1 }], spareAllies: true } });

orb('chacal_de_anubis', 'mordida_espectral');
edit('chacal_de_anubis', 'mordida_espectral', { description: 'Mordida mágica que atravessa qualquer armadura e arranca os reforços do alvo.' });

orb('gato_das_esfinges', 'leitura_de_mente');
edit('gato_das_esfinges', 'leitura_de_mente', { description: 'Reação: lê a intenção do atacante e se esquiva de um golpe.' });

orb('fada_da_miragem', 'roubo_de_reflexos');
edit('fada_da_miragem', 'roubo_de_reflexos', { description: 'Reação: ao ser atacada, troca dois inimigos de lugar com uma miragem.' });

orb('elemental_de_vidro', 'foco_de_luz');
edit('elemental_de_vidro', 'foco_de_luz', { description: 'Concentra a luz num feixe em linha de 7 casas.' });

orb('sapo_da_chama', 'salto_explosivo');
edit('sapo_da_chama', 'salto_explosivo', { description: 'Salta sobre o alvo e explode em chamas em raio 1, incendiando o chão.' });

orb('verme_das_dunas', 'engolir_vivo');
edit('verme_das_dunas', 'engolir_vivo', { description: 'Engole o alvo: ele fica Aprisionado (não age e sofre dano) por 3 turnos ou até um golpe forte soltá-lo.' });

orb('esfinge_guardia', 'sopro_de_areia_do_tempo');
edit('esfinge_guardia', 'sopro_de_areia_do_tempo', { description: 'Sopro de areia do tempo em cone: envelhece a armadura (quebrada) e enfraquece os inimigos.' });

orb('lamia_da_areia', 'drenagem_de_sangue_frio');
edit('lamia_da_areia', 'drenagem_de_sangue_frio', { description: 'Morde e drena 60% do dano em vida; dano dobrado em alvos presos ou imobilizados.' });

orb('golem_de_arenito', 'arremesso_de_obelisco');
edit('golem_de_arenito', 'arremesso_de_obelisco', { description: 'Arremessa um obelisco a até 7 casas, esmagando o alvo e quem estiver colado nele.' });

orb('passaro_do_sol', 'cinzas_renascidas');
edit('passaro_do_sol', 'cinzas_renascidas', { description: 'Passiva: ao cair, explode em chamas e renasce das cinzas com 50% da vida depois de 2 rodadas (se não destruírem o ovo).' });

orb('apopis', 'areia_movedica_global');
edit('apopis', 'areia_movedica_global', { description: 'Transforma o chão em areia movediça: todos os inimigos são puxados, enlameados e ficam Lentos.' });

orb('ifrit_ancestral', 'calor_opressivo');
edit('ifrit_ancestral', 'calor_opressivo', { description: 'Passiva: um calor que queima todos os inimigos do mapa a cada rodada.' });

// ───────────────────────────── Costa ─────────────────────────────

orb('gaivota_ladra', 'grito_irritante');
edit('gaivota_ladra', 'grito_irritante', { description: 'Grito em raio 4 que confunde a mira: os aliados ganham duplicatas ilusórias (+30 de esquiva) por 1 turno.' });

orb('caranguejo_eremita', 'retrair_na_concha');
edit('caranguejo_eremita', 'retrair_na_concha', { description: 'Reação: recolhe-se na concha e anula um golpe físico.' });

orb('pelicano_pescador', 'bolsa_de_captura');
edit('pelicano_pescador', 'bolsa_de_captura', { description: 'Agarra o alvo com a bolsa do bico: ele fica preso (não se move e sofre dano).' });

orb('iguana_marinha', 'mordida_de_algas');
edit('iguana_marinha', 'mordida_de_algas', { description: 'Mordida suja de algas: abre uma ferida que impede cura por 3 turnos.' });

orb('tartaruga_casco_de_ferro', 'defesa_de_carapaca');
edit('tartaruga_casco_de_ferro', 'defesa_de_carapaca', { description: 'Passiva: o casco reduz em 50% o dano à distância e em 15% o dano físico.' });

orb('arraia_lixa', 'ferrao_de_cauda');
edit('arraia_lixa', 'ferrao_de_cauda', { description: 'Ferroada que atordoa; vindo do esconderijo, +50% de dano.' });

add('enguia_da_rocha', {
  id: 'choque_de_enguia', name: 'Choque de Enguia',
  description: 'Descarga elétrica no alvo ao lado: Eletrocutado por 2 turnos e dano 80% maior se ele estiver molhado ou na água.',
  kind: 'magic', range: 1, power: 6, cooldown: 2, element: 'eletricidade', status: { id: 'eletrocutado', turns: 2 },
  fx: { vs: { status: 'molhado|na_agua', mult: 1.8 } },
});
orb('enguia_da_rocha', 'choque_de_enguia');

orb('cao_dagua', 'nado_de_resgate');
edit('cao_dagua', 'nado_de_resgate', { description: 'Resgata um aliado a até 4 casas: cura 15% da vida e remove efeitos negativos.' });

orb('estrela_do_mar', 'toxina_de_contato');
edit('estrela_do_mar', 'toxina_de_contato', { description: 'Reação: quem a toca corpo a corpo fica Lento por 2 turnos (até 3 por rodada).' });

edit('lula_da_costa', 'nuvem_de_tinta', {
  description: 'Fumaça: jato de tinta (raio 2) que cega quem estiver dentro. Anda 1 casa por turno seu.',
  fx: { noDamage: true, cloud: 'tinta' },
});
orb('lula_da_costa', 'nuvem_de_tinta');

orb('sereia_das_rochas', 'canto_melancolico');
edit('sereia_das_rochas', 'canto_melancolico', { description: 'Canto que atrai: puxa o alvo 3 casas e o deixa Confuso por 1 turno.' });

orb('caranguejo_recife', 'recolher_se_em_coral');
edit('caranguejo_recife', 'recolher_se_em_coral', { description: 'Reação: recolhe-se no coral e anula qualquer golpe (1 por rodada).' });

orb('leviata_menor', 'jato_de_alta_pressao');
edit('leviata_menor', 'jato_de_alta_pressao', { description: 'Jato d\'água em linha de 6 casas que ignora metade da armadura.' });

orb('fada_do_mar', 'bencao_de_oxigenio');
edit('fada_do_mar', 'bencao_de_oxigenio', { description: 'Abençoa um aliado: remove efeitos negativos e o deixa Veloz por 2 turnos.' });

orb('cavalo_marinho_anciao', 'sopro_de_bolhas_acidas');
edit('cavalo_marinho_anciao', 'sopro_de_bolhas_acidas', { description: 'Cone de bolhas ácidas que corroem a armadura (quebrada por 2 turnos).' });

orb('espirito_da_espuma', 'cura_salgada');
edit('espirito_da_espuma', 'cura_salgada', { description: 'Espuma curativa em raio 3: cura 15% da vida dos aliados.' });

orb('tubarao_da_nevoa', 'sentido_de_sangue');
edit('tubarao_da_nevoa', 'sentido_de_sangue', { description: 'Passiva: fica Veloz enquanto algum inimigo sangra e causa 30% mais dano em quem sangra.' });

orb('polvo_mimico', 'tentaculos_magicos');
edit('polvo_mimico', 'tentaculos_magicos', { description: 'Tentáculos de sombra agarram um alvo a até 4 casas.' });

orb('tubarao_megalo', 'mordida_estracalhadora');
edit('tubarao_megalo', 'mordida_estracalhadora', { description: 'Mordida brutal que deixa o alvo sangrando por 4 turnos.' });

orb('hidra_costeira', 'botes_multiplos');
edit('hidra_costeira', 'botes_multiplos', { description: 'Várias cabeças atacam ao mesmo tempo: golpeia todos os inimigos em raio 2.', fx: { hits: 1, spareAllies: true } });

orb('tratador_de_ondas', 'grito_de_comando');
edit('tratador_de_ondas', 'grito_de_comando', { description: 'Grito de comando em raio 4: os aliados ficam Afiados (+25% de crítico) por 3 turnos.' });

orb('quelone_ilha', 'casco_ilha');
edit('quelone_ilha', 'casco_ilha', { description: 'Passiva: o casco do tamanho de uma ilha reduz em 35% todo dano físico e à distância.' });

orb('caminhante_das_mares', 'prisao_de_bolha');
edit('caminhante_das_mares', 'prisao_de_bolha', { description: 'Prende um inimigo numa bolha d\'água: Aprisionado por 2 turnos.' });

edit('kraken', 'tinta_cegante_abissal', {
  description: 'Fumaça: tinta abissal sobre todos os inimigos — cegos, e cada um preso numa nuvem de tinta que anda 1 casa por turno seu.',
  fx: { noDamage: true, randomTargets: 99, cloud: 'tinta' },
});
orb('kraken', 'tinta_cegante_abissal');

edit('scylla', 'nevoeiro_de_sangue', {
  description: 'Fumaça: névoa de sangue (raio 2) que faz sangrar quem estiver dentro. Anda 1 casa por turno seu.',
  fx: { cloud: 'nevoa_de_sangue' },
});
orb('scylla', 'nevoeiro_de_sangue');

// ───────────────────────────── grava ─────────────────────────────

// Invocações não deixam joia.
const SUMMONS = new Set(['tentaculo_kraken', 'esqueleto_servo', 'elemental_invocado', 'torreta_mecanica', 'lobo_companheiro']);
const missing = list.filter((c) => !SUMMONS.has(c.id) && !orbs[c.id]).map((c) => c.id);
if (missing.length) throw new Error(`criaturas sem orbe: ${missing.join(', ')}`);
for (const [cid, sid] of Object.entries(orbs)) {
  const c = creature(cid);
  c.drops.jewel = { ...c.drops.jewel, type: 'habilidade', skill: sid };
}
fs.writeFileSync(FILE, JSON.stringify(list, null, 1) + '\n');
console.log(`${Object.keys(orbs).length} orbes definidos.`);
