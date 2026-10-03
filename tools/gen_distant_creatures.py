"""Gera data/bestiary/distant.json: criaturas das transições e dos biomas distantes (D125).

Cada uma é uma variante de uma criatura do bestiário-base (mesmo esqueleto de sprite, paleta tingida
com a cor da região), com nome, nível, elemento e habilidades próprias (ids prefixados). Rode de novo
depois de mudar o bestiário-base: `python3 tools/gen_distant_creatures.py`.
"""
import json, copy

BASE = {c['id']: c for c in json.load(open('src/game/data/bestiary/creatures.json'))}

TINT = {
    'taiga': '#4e6b5a', 'costa_gelada': '#8fb3c9', 'oasis': '#4fb39a', 'estepe': '#b8a061', 'charneca': '#7a6a8a', 'mangue': '#4f6b3a',
    'pantano': '#5a6b3c', 'vulcao': '#c2451e', 'selva': '#b3263a', 'geleira': '#cfe8ff', 'cristal': '#b388ff', 'arquipelago': '#2f8fbf', 'terra_morta': '#5b4a6b',
}
ELEMENT = {'pantano': 'veneno', 'vulcao': 'fogo', 'selva': 'veneno', 'geleira': 'gelo', 'cristal': 'eletricidade', 'arquipelago': 'agua', 'terra_morta': 'sombra',
           'taiga': 'gelo', 'costa_gelada': 'gelo', 'oasis': 'agua', 'estepe': 'vento', 'charneca': 'sombra', 'mangue': 'veneno'}
# Nível mínimo por região (terras distantes são perigosas; o continente usa os mesmos +6).
FLOOR = {'pantano': 18, 'arquipelago': 20, 'selva': 22, 'cristal': 26, 'vulcao': 30, 'geleira': 34, 'terra_morta': 36}

# (região, base, id novo, nome, raridade, descrição)
LIST = [
    # Transições
    ('taiga', 'lobo_cinzento_do_norte', 'lobo_da_taiga', 'Lobo-da-Taiga', 'comum', 'Caça entre pinheiros cobertos de neve; a pelagem muda de cor com a estação.'),
    ('taiga', 'urso_chifre', 'urso_de_resina', 'Urso-de-Resina', 'raro', 'Esfrega-se nos pinheiros até a pele virar uma couraça de resina congelada.'),
    ('costa_gelada', 'foca_leopardo', 'foca_de_bruma', 'Foca-de-Bruma', 'comum', 'Emerge das placas de gelo da costa sem fazer barulho.'),
    ('costa_gelada', 'serpente_da_geada', 'serpe_do_gelo_salgado', 'Serpe-do-Gelo-Salgado', 'raro', 'Nada sob o gelo fino e quebra a superfície embaixo da presa.'),
    ('oasis', 'iguana_marinha', 'lagarto_do_oasis', 'Lagarto-do-Oásis', 'comum', 'Defende a água como um tesouro; cospe areia molhada.'),
    ('oasis', 'sereia_das_rochas', 'ninfa_da_fonte', 'Ninfa-da-Fonte', 'raro', 'Canta à beira do oásis; quem bebe sem pedir esquece o caminho.'),
    ('estepe', 'coiote_das_estepes', 'chacal_da_estepe', 'Chacal-da-Estepe', 'comum', 'Corre em matilhas enormes atrás das caravanas.'),
    ('estepe', 'centauro_nomade', 'cavaleiro_do_vento_seco', 'Cavaleiro-do-Vento-Seco', 'raro', 'Centauro solitário que cobra pedágio nas trilhas.'),
    ('charneca', 'texugo_da_nevoa', 'texugo_da_charneca', 'Texugo-da-Charneca', 'comum', 'Cava tocas sob as urzes e ataca os tornozelos.'),
    ('charneca', 'espantalho_anciao', 'vulto_da_urze', 'Vulto-da-Urze', 'raro', 'Ninguém sabe se é espantalho ou fantasma; anda quando ninguém olha.'),
    ('mangue', 'caranguejo_eremita', 'caranguejo_do_mangue', 'Caranguejo-do-Mangue', 'comum', 'Mil deles sobem as raízes ao anoitecer.'),
    ('mangue', 'vibora_cipo', 'jararaca_das_raizes', 'Jararaca-das-Raízes', 'raro', 'Pendura-se nas raízes aéreas e cai sobre a presa.'),
    # Brejo Cinzento
    ('pantano', 'ra_saltadora', 'sapo_bolha', 'Sapo-Bolha', 'comum', 'Infla até explodir em esporos quando morre.'),
    ('pantano', 'vibora_cipo', 'serpente_do_lodo', 'Serpente-do-Lodo', 'comum', 'Invisível sob a lama até o bote.'),
    ('pantano', 'aranha_tecer_teia', 'aranha_do_junco', 'Aranha-do-Junco', 'comum', 'Tece redes entre os juncos; pesca pássaros e viajantes.'),
    ('pantano', 'fungo_caminhante', 'cogumelo_afogado', 'Cogumelo-Afogado', 'raro', 'Um corpo de fungo que guarda o rosto de quem se afogou.'),
    ('pantano', 'enguia_da_rocha', 'enguia_do_brejo', 'Enguia-do-Brejo', 'raro', 'Descarrega a lama inteira de uma vez.'),
    ('pantano', 'hidra_costeira', 'hidra_do_brejo', 'Hidra-do-Brejo', 'epico', 'Cada cabeça cortada cai no lodo e brota de novo.'),
    ('pantano', 'anciao_verde', 'rainha_do_lodo', 'Rainha-do-Lodo', 'lendario', 'O próprio brejo, quando acorda; guarda a Catacumba Afogada.'),
    # Picos de Cinza
    ('vulcao', 'lagarto_armado', 'salamandra_de_cinza', 'Salamandra-de-Cinza', 'comum', 'Vive na rocha quente e cospe brasa.'),
    ('vulcao', 'abutre_do_sol', 'corvo_de_brasa', 'Corvo-de-Brasa', 'comum', 'As penas soltam fagulhas no voo.'),
    ('vulcao', 'escorpiao_da_areia', 'escorpiao_de_magma', 'Escorpião-de-Magma', 'comum', 'O ferrão é rocha derretida.'),
    ('vulcao', 'golem_de_arenito', 'golem_de_obsidiana', 'Golem-de-Obsidiana', 'raro', 'Vidro vulcânico com uma chama no peito.'),
    ('vulcao', 'sapo_da_chama', 'sapo_de_lava', 'Sapo-de-Lava', 'raro', 'Nada na lava como se fosse água.'),
    ('vulcao', 'wyvern_da_geada', 'serpe_de_cinzas', 'Serpe-de-Cinzas', 'epico', 'Voa dentro da fumaça e cai sobre a presa em chamas.'),
    ('vulcao', 'ifrit_ancestral', 'senhor_da_forja_esquecida', 'Senhor da Forja Esquecida', 'lendario', 'O ferreiro que forjou a primeira lâmina e nunca apagou a forja.'),
    # Mata Rubra
    ('selva', 'gato_de_musgo', 'onca_rubra', 'Onça-Rubra', 'comum', 'Pintas vermelhas; caça de cima das árvores.'),
    ('selva', 'vibora_chifruda', 'cascavel_de_folha', 'Cascavel-de-Folha', 'comum', 'Imita uma folha caída até o último instante.'),
    ('selva', 'coruja_silenciosa', 'arara_gritadeira', 'Arara-Gritadeira', 'comum', 'O grito avisa a selva inteira.'),
    ('selva', 'aracne_mae', 'aranha_das_mil_presas', 'Aranha-das-Mil-Presas', 'raro', 'Mãe de um ninho que cobre um vale.'),
    ('selva', 'vibora_das_sombras', 'serpente_de_jade', 'Serpente-de-Jade', 'raro', 'Escamas como pedra polida; o veneno cega.'),
    ('selva', 'quimera_da_mata', 'quimera_rubra', 'Quimera-Rubra', 'epico', 'Três cabeças e um só apetite.'),
    ('selva', 'dragao_da_clareira', 'devorador_do_templo', 'Devorador do Templo Engolido', 'lendario', 'Dorme enrolado no templo que a selva engoliu.'),
    # Teto do Mundo
    ('geleira', 'lebre_artica', 'lebre_de_cristal', 'Lebre-de-Cristal', 'comum', 'Tão branca que só se vê a sombra.'),
    ('geleira', 'lobo_cinzento_do_norte', 'lobo_da_geleira', 'Lobo-da-Geleira', 'comum', 'Uiva e a neve desaba.'),
    ('geleira', 'morsa_presa_de_ferro', 'morsa_glacial', 'Morsa-Glacial', 'comum', 'Quebra o gelo com as presas para afogar caçadores.'),
    ('geleira', 'golem_de_gelo', 'colosso_de_neve', 'Colosso-de-Neve', 'raro', 'Uma avalanche que aprendeu a andar.'),
    ('geleira', 'espectro_da_nevasca', 'espectro_do_pico', 'Espectro-do-Pico', 'raro', 'Os alpinistas que não voltaram.'),
    ('geleira', 'yeti', 'yeti_ancestral', 'Yeti-Ancestral', 'epico', 'O mais velho da espécie; tem cicatrizes de flechas de outra era.'),
    ('geleira', 'cryon', 'guardiao_do_teto', 'Guardião do Teto do Mundo', 'lendario', 'Vigia a Cripta de Gelo Eterno desde antes dos Selos.'),
    # Ermo de Cristal
    ('cristal', 'tarantula_das_dunas', 'aranha_de_quartzo', 'Aranha-de-Quartzo', 'comum', 'Tece fios de vidro que cortam.'),
    ('cristal', 'escorpiao_obsidiana', 'escorpiao_prisma', 'Escorpião-Prisma', 'comum', 'A luz atravessa a carapaça e cega.'),
    ('cristal', 'falcao_do_deserto', 'falcao_espelhado', 'Falcão-Espelhado', 'comum', 'Reflete o sol direto nos olhos da presa.'),
    ('cristal', 'elemental_de_vidro', 'elemental_de_prisma', 'Elemental-de-Prisma', 'raro', 'Raio que ficou preso num cristal.'),
    ('cristal', 'gato_das_esfinges', 'gato_ressonante', 'Gato-Ressonante', 'raro', 'O ronronar faz os cristais cantarem.'),
    ('cristal', 'passaro_trovao_menor', 'ave_de_relampago_cristalino', 'Ave-de-Relâmpago-Cristalino', 'epico', 'Pousa nas torres de cristal e as carrega de raios.'),
    ('cristal', 'apopis', 'bibliotecario_partido', 'O Bibliotecário Partido', 'lendario', 'Guardião da Biblioteca Partida; feito dos livros que leu.'),
    # Arquipélago das Velas
    ('arquipelago', 'gaivota_ladra', 'gaivota_pirata', 'Gaivota-Pirata', 'comum', 'Rouba anéis, moedas e às vezes dedos.'),
    ('arquipelago', 'caranguejo_eremita', 'caranguejo_de_casco_de_navio', 'Caranguejo-Casco-de-Navio', 'comum', 'Usa um casco de barco como concha.'),
    ('arquipelago', 'lula_da_costa', 'lula_de_tinta_negra', 'Lula-de-Tinta-Negra', 'comum', 'A tinta apaga as tochas.'),
    ('arquipelago', 'tubarao_da_nevoa', 'tubarao_de_recife', 'Tubarão-de-Recife', 'raro', 'Patrulha a entrada da Gruta do Naufrágio.'),
    ('arquipelago', 'polvo_mimico', 'polvo_do_farol', 'Polvo-do-Farol', 'raro', 'Acende luzes falsas para guiar navios às pedras.'),
    ('arquipelago', 'tubarao_megalo', 'tubarao_rei', 'Tubarão-Rei', 'epico', 'Cicatrizes de arpões de três reinos.'),
    ('arquipelago', 'scylla', 'senhora_do_farol', 'A Senhora do Farol Submerso', 'lendario', 'Afogou o farol para que ninguém achasse o caminho de volta.'),
    # Terra Morta
    ('terra_morta', 'abutre_cinzento', 'abutre_do_vazio', 'Abutre-do-Vazio', 'comum', 'Come o que o Vazio deixou para trás.'),
    ('terra_morta', 'hiena_panda', 'hiena_oca', 'Hiena-Oca', 'comum', 'Por dentro não há nada; ri mesmo assim.'),
    ('terra_morta', 'cao_de_corte', 'cao_sem_sombra', 'Cão-sem-Sombra', 'comum', 'Perdeu a sombra para o Vazio e caça a dos outros.'),
    ('terra_morta', 'espirito_lanterna_azul', 'eco_de_alma', 'Eco-de-Alma', 'raro', 'Repete a última frase de quem foi levado.'),
    ('terra_morta', 'gorgona_errante', 'vigia_de_pedra_cinza', 'Vigia-de-Pedra-Cinza', 'raro', 'Transforma em cinza o que olha.'),
    ('terra_morta', 'manticora_das_estepes', 'manticora_do_vazio', 'Mantícora-do-Vazio', 'epico', 'Metade fera, metade fresta.'),
    ('terra_morta', 'corredor_do_horizonte', 'arauto_dos_selos', 'O Arauto dos Selos Partidos', 'lendario', 'Anuncia cada Selo que racha; guarda o Sepulcro dos Selos.'),
]

LEVELS = {'comum': (0, 12), 'raro': (3, 16), 'epico': (8, 22), 'lendario': (14, 30)}

def tint(hexc, to, k):
    a = [int(hexc[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(to[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * k):02x}' for x, y in zip(a, b))

out = []
for region, base_id, nid, name, rarity, desc in LIST:
    b = copy.deepcopy(BASE[base_id])
    floor = FLOOR.get(region, 8)
    lo, hi = LEVELS[rarity]
    c = {k: v for k, v in b.items() if k not in ('biomes',)}
    c['id'] = nid
    c['name'] = name
    c['description'] = desc
    c['rarity'] = rarity
    c['levelMax'] = min(60, floor + hi)
    c['levelMin'] = min(floor + lo, c['levelMax'] - 4)
    c['biomes'] = []
    c['regions'] = [region]
    el = ELEMENT[region]
    if c.get('element', 'neutro') == 'neutro' or rarity in ('epico', 'lendario'):
        c['element'] = el
    # Mais robustas que a base: nível de partida mais alto já cobre; um pouco mais de vida.
    c['hp'] = round(b['hp'] * 1.15)
    c['xp'] = round(b['xp'] * 1.3)
    c['palette'] = {k: tint(v, TINT[region], 0.38 if k != 'E' else 0) for k, v in b['palette'].items()}
    ren = {}
    for s in c['skills']:
        new = f"{nid}__{s['id']}"
        ren[s['id']] = new
        s['id'] = new
        if s.get('element') and s['kind'] in ('magic', 'ranged') and rarity != 'comum':
            s['element'] = el
    # Referências internas (joias, sinais) para as habilidades renomeadas.
    def fix(o):
        if isinstance(o, dict):
            return {k: (ren.get(v, v) if isinstance(v, str) else fix(v)) for k, v in o.items()}
        if isinstance(o, list):
            return [fix(x) for x in o]
        return o
    c['skills'] = fix(c['skills'])
    if c.get('drops'):
        c['drops'] = fix(c['drops'])
    c.pop('summonOnly', None)
    out.append(c)

json.dump(out, open('src/game/data/bestiary/distant.json', 'w'), ensure_ascii=False, indent=1)
print(len(out), 'criaturas')
