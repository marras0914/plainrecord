/**
 * GENERATED FILE — do not edit.
 *
 * Source: i18n/copy.json
 * Regenerate: npm run i18n:gen
 *
 * Edits here are lost on the next run, and `npm run i18n:check` fails while
 * this file disagrees with copy.json.
 */

/** Every copy key on the site. A typo is a compile error, not a blank space. */
export type CopyKey =
  | "verdict.fewMarks.headline"
  | "verdict.fewMarks.caveat"
  | "verdict.weakLoad.headline"
  | "verdict.weakLoad.caveat"
  | "verdict.balanced.headline"
  | "verdict.balanced.caveat"
  | "verdict.crossover.headline"
  | "verdict.crossover.caveat"
  | "verdict.consistent.headline"
  | "verdict.consistent.caveat"
  | "verdict.nearMiddle.headline"
  | "verdict.nearMiddle.caveat"
  | "score.almostAlways"
  | "score.moreOften"
  | "score.leansToward"
  | "score.chance"
  | "score.leansAgainst"
  | "score.againstAlways"
  | "axis.alignment"
  | "axis.load"
  | "intro.h1"
  | "intro.p1"
  | "intro.p2"
  | "intro.p3"
  | "intro.p4"
  | "intro.fine"
  | "bias.heading"
  | "bias.p1"
  | "bias.p2"
  | "bias.p3"
  | "bias.p3b"
  | "bias.p4"
  | "bias.fine"
  | "author.heading"
  | "author.built"
  | "author.donation"
  | "author.job"
  | "author.races"
  | "author.why"
  | "author.contact"
  | "mode.short"
  | "mode.full"
  | "mode.shortDesc"
  | "mode.fullDesc"
  | "cand.note"
  | "stmt.heading"
  | "stmt.note"
  | "preset.heading"
  | "preset.mixed"
  | "preset.muted"
  | "preset.consistent"
  | "preset.reset"
  | "preset.note"
  | "ui.showTable"
  | "ui.hideTable"
  | "ui.methodHeading"
  | "ui.officialCaption"
  | "ui.translationNotice"
  | "noun.vote.one"
  | "noun.vote.many"
  | "party.D"
  | "party.R"
  | "verdict.mildLean.headline"
  | "verdict.mildLean.caveat";

export type Locale = 'en' | 'es';

export const COPY: Record<Locale, Record<CopyKey, string>> = {
  en: {
    "verdict.fewMarks.headline": "Answer a few more and we can tell you something",
    "verdict.fewMarks.caveat": "So far you have answered {n} {votes}. We need at least {min}.",
    "verdict.weakLoad.headline": "These votes can't really place you",
    "verdict.weakLoad.caveat": "On the ones you answered, Republicans and Democrats mostly voted the same way. So your answers do not say much about which party you are closer to — whichever way they fell.",
    "verdict.balanced.headline": "You are split right down the middle",
    "verdict.balanced.caveat": "About as many of your answers matched Republicans as matched Democrats. This is the purple result.",
    "verdict.crossover.headline": "You lean toward {party}, but you cross over a lot",
    "verdict.crossover.caveat": "Most of your answers matched {party}, but a big share matched {other} instead.",
    "verdict.consistent.headline": "You line up with {party} nearly every time",
    "verdict.consistent.caveat": "Almost all of your answers matched the same party.",
    "verdict.nearMiddle.headline": "You sit near the middle",
    "verdict.nearMiddle.caveat": "Not because you split between the parties — the votes you answered mostly fell close to the line between them anyway.",
    "score.almostAlways": "Votes with you almost always",
    "score.moreOften": "Votes with you more often than not",
    "score.leansToward": "Leans toward your positions",
    "score.chance": "No clearer than chance either way",
    "score.leansAgainst": "Leans against your positions",
    "score.againstAlways": "Votes against you almost always",
    "axis.alignment": "how much does this legislator vote with you",
    "axis.load": "how partisan-coded are your own positions?",
    "intro.h1": "The Purple Strip",
    "intro.p1": "Texas lawmakers vote yes or no on new laws. We took real votes from 2025 and hid who voted which way. Now you vote.",
    "intro.p2": "For each one we count how many Republicans said yes, and how many Democrats said yes. Mostly Republicans? We colour it red. Mostly Democrats? Blue. Both parties agreed? Grey — that vote doesn't tell us much about sides.",
    "intro.p3": "Every answer you give becomes one dot. Dots on the left mean you agreed with Democrats. Dots on the right mean you agreed with Republicans. If your dots land on both sides, you don't fit neatly in one party. That's the purple part.",
    "intro.p4": "Then we show you what these areas actually look like in Texas today — school funding, health coverage, and so on — with the source for every number.",
    "intro.fine": "Nobody's opinion decides the colours. They come from the actual vote counts, and you can check them on every question. The outcome numbers are real too, but a state ranking has many causes — we show you the numbers and the votes, and leave the connecting to you.",
    "bias.heading": "Doesn't this favour the people who have voting records?",
    "bias.p1": "It would, if we scored anyone else. So we don't. A score here needs one thing — the same bills, voted on by both of you. Only members of the Texas House have that. All {n} candidates above sit in the Texas House. Every one of the people they are running against does not:",
    "bias.p2": "So they get no number at all — not a low one, not an estimate. Any score we printed for them would be votes we made up.",
    "bias.p3": "What stops this being a page about {n} Democrats. Under every one of the {items} questions we also show {total} sitting House members — {reps} Republicans and {dems} Democrats.",
    "bias.p3b": "They voted on the same bills you are answering ({lo}–{hi} of {items}), so they are scored the way the candidates are, on every question rather than a chosen few. If the Republican records land close to the Democratic ones on your answers, that is the finding, not a thumb on the scale.",
    "bias.p4": "Where an opponent does leave a mark. On {acts} of the {items} there is a recorded action on the exact bill — a veto, or a bill named a must-pass priority. We show it under that question and we never add it to a tally.",
    "bias.fine": "One rule picks all {total} of those names, and it cannot be tuned question by question. So if you think it is doing work it shouldn't, the rule is the thing to argue with — and every vote behind it is in {payload}. The other half of this answer is who made this and what I have at stake.",
    "author.heading": "Who made this, who paid for it, and what I have at stake",
    "author.built": "I'm Marco Arras, and I built this on my own time. Nobody paid for it — no campaign, no party, no PAC, no organisation. There was no budget. The cost was evenings.",
    "author.donation": "I donate to the Democratic Party. You should know that before you read anything else here, and it is the reason this page is built the way it is rather than a footnote to it. I have a side. So the rule that picks the comparison members runs identically on both caucuses, a third of the questions are reserved for votes where the two parties agreed, the selection rule is named and published, and every vote, count and score sits in one file you can download and check. None of that asks you to trust me. That is the whole point of it.",
    "author.job": "What I do for a living. I work as a solutions architect in energy. The sector buys and sells power, which overlaps the utilities votes on this page, so you should weigh what I say about those accordingly. My employer had no involvement in this, did not fund it and did not review it. I do no paid political work of any kind.",
    "author.races": "I picked these three races. Governor, Lieutenant Governor and U.S. Senate. That is an editorial decision, not a measurement, and it is the choice most worth arguing with. I picked them because all three Democratic candidates sit in the Texas House, which means their records can be checked against your answers vote for vote. Their opponents cannot be, so this page gives them no score at all rather than an invented one.",
    "author.why": "Why I made it. Almost everything that reaches people about how their state is actually governed arrives pre-framed by someone who wants something. The votes themselves are public, tedious, and genuinely hard to get at. I wanted a way to see the record before seeing the label, and to hand over the entire file so that anyone can check the record is what I say it is.",
    "author.contact": "If something here is wrong, tell me: {email}. Corrections get made, and noted on the page.",
    "mode.short": "7 big issues",
    "mode.full": "All {n} votes",
    "mode.shortDesc": "Seven of the session's biggest fights — the bills the Lieutenant Governor named a top priority, or the Governor vetoed. Each one shows why it was chosen.",
    "mode.fullDesc": "All {n} votes: one per bill, spread across 20 subject areas by a written rule, with a third of the slots reserved for votes where both parties agreed.",
    "cand.note": "All three sat in the same chamber and are running for different offices, so these are three separate readouts, not a ranking. They voted together on most party-line bills, so expect the numbers to sit close together — where they diverge is the interesting part. Coverage over these {items} votes: {coverage}. A vote they missed is dropped for them alone, not counted against them.",
    "stmt.heading": "Statements of vote",
    "stmt.note": "A Texas member may file a statement saying the Journal recorded them wrongly. The recorded vote is the official act and is what is scored here; the statement is shown beside it, never applied in its place.",
    "preset.heading": "Try a profile",
    "preset.mixed": "Cross-pressured voter",
    "preset.muted": "Low-signal votes only",
    "preset.consistent": "Consistent partisan",
    "preset.reset": "Clear",
    "preset.note": "The first two produce almost the same net lean — a single blended swatch would render both as the same purple. They are opposite findings, so the readout separates them on partisan load.",
    "ui.showTable": "Show table",
    "ui.hideTable": "Hide table",
    "ui.methodHeading": "How this is built",
    "ui.officialCaption": "Official caption, as recorded",
    "ui.translationNotice": "Spanish here is our translation, not an official version. The official text of every bill is in English and is one tap away on each question.",
    "noun.vote.one": "vote",
    "noun.vote.many": "votes",
    "party.D": "Democrats",
    "party.R": "Republicans",
    "verdict.mildLean.headline": "You lean toward {party}",
    "verdict.mildLean.caveat": "More of your answers matched that party than the other one.",
  },
  es: {
    "verdict.fewMarks.headline": "Responda unas cuantas más y podremos decirle algo",
    "verdict.fewMarks.caveat": "Hasta ahora ha respondido {n} {votes}. Necesitamos al menos {min}.",
    "verdict.weakLoad.headline": "Estos votos no alcanzan para ubicarle",
    "verdict.weakLoad.caveat": "En los que respondió, republicanos y demócratas votaron casi siempre del mismo modo. Así que sus respuestas no dicen mucho sobre a qué partido está más cerca, en ninguna dirección.",
    "verdict.balanced.headline": "Está dividido exactamente por la mitad",
    "verdict.balanced.caveat": "Aproximadamente tantas de sus respuestas coincidieron con los republicanos como con los demócratas. Este es el resultado morado.",
    "verdict.crossover.headline": "Se inclina hacia {party}, pero cruza líneas a menudo",
    "verdict.crossover.caveat": "La mayoría de sus respuestas coincidieron con {party}, pero una parte considerable coincidió con {other}.",
    "verdict.consistent.headline": "Coincide con {party} casi siempre",
    "verdict.consistent.caveat": "Casi todas sus respuestas coincidieron con el mismo partido.",
    "verdict.nearMiddle.headline": "Se ubica cerca del centro",
    "verdict.nearMiddle.caveat": "No porque se divida entre los partidos, sino porque los votos que respondió ya caían cerca de la línea entre ellos.",
    "score.almostAlways": "Vota con usted casi siempre",
    "score.moreOften": "Vota con usted más veces que no",
    "score.leansToward": "Se inclina hacia sus posturas",
    "score.chance": "No más claro que el azar en ningún sentido",
    "score.leansAgainst": "Se inclina en contra de sus posturas",
    "score.againstAlways": "Vota en contra de usted casi siempre",
    "axis.alignment": "cuánto vota este legislador con usted",
    "axis.load": "¿qué tan partidistas son sus propias posturas?",
    "intro.h1": "La Franja Morada",
    "intro.p1": "Los legisladores de Texas votan a favor o en contra de nuevas leyes. Tomamos votos reales de 2025 y ocultamos quién votó de qué manera. Ahora vota usted.",
    "intro.p2": "En cada uno contamos cuántos republicanos votaron a favor y cuántos demócratas votaron a favor. ¿Sobre todo republicanos? Lo pintamos de rojo. ¿Sobre todo demócratas? Azul. ¿Los dos partidos de acuerdo? Gris, porque ese voto no nos dice mucho sobre bandos.",
    "intro.p3": "Cada respuesta que da se convierte en un punto. Los puntos a la izquierda significan que coincidió con los demócratas. Los de la derecha, con los republicanos. Si sus puntos caen en los dos lados, usted no encaja limpiamente en un solo partido. Esa es la parte morada.",
    "intro.p4": "Después le mostramos cómo están realmente estas áreas en Texas hoy: financiamiento escolar, cobertura de salud y otras, con la fuente de cada cifra.",
    "intro.fine": "La opinión de nadie decide los colores. Salen de los conteos reales de votos, y usted puede verificarlos en cada pregunta. Las cifras de resultados también son reales, pero la posición de un estado tiene muchas causas: le mostramos las cifras y los votos, y la conexión la hace usted.",
    "bias.heading": "¿No favorece esto a quienes tienen historial de votos?",
    "bias.p1": "Lo haría, si calificáramos a alguien más. Por eso no lo hacemos. Una calificación aquí necesita una sola cosa: los mismos proyectos de ley, votados por ambos. Solo los miembros de la Cámara de Representantes de Texas tienen eso. Los {n} candidatos de arriba están en la Cámara de Texas. Ninguna de las personas contra las que compiten lo está:",
    "bias.p2": "Así que no reciben ninguna cifra: ni baja, ni estimada. Cualquier calificación que imprimiéramos para ellos serían votos que nos inventamos.",
    "bias.p3": "Lo que evita que esta sea una página sobre {n} demócratas. Debajo de cada una de las {items} preguntas mostramos también a {total} miembros en funciones de la Cámara: {reps} republicanos y {dems} demócratas.",
    "bias.p3b": "Votaron los mismos proyectos que usted está respondiendo ({lo}-{hi} de {items}), así que se califican igual que los candidatos, en cada pregunta y no en unas pocas escogidas. Si los historiales republicanos quedan cerca de los demócratas según sus respuestas, ese es el hallazgo, no un pulgar en la balanza.",
    "bias.p4": "Donde un oponente sí deja huella. En {acts} de las {items} hay una acción registrada sobre ese mismo proyecto: un veto, o un proyecto declarado prioridad obligada. La mostramos debajo de esa pregunta y nunca la sumamos a un conteo.",
    "bias.fine": "Una sola regla escoge los {total} nombres, y no se puede ajustar pregunta por pregunta. Así que si cree que está haciendo un trabajo que no debería, la regla es lo que hay que discutir, y cada voto detrás de ella está en {payload}. La otra mitad de esta respuesta es quién hizo esto y qué tengo en juego.",
    "author.heading": "Quién hizo esto, quién lo pagó y qué tengo en juego",
    "author.built": "Soy Marco Arras y hice esto en mi propio tiempo. Nadie lo pagó: ninguna campaña, ningún partido, ningún PAC, ninguna organización. No hubo presupuesto. El costo fueron mis noches.",
    "author.donation": "Yo dono al Partido Demócrata. Debería saberlo antes de leer cualquier otra cosa aquí, y es la razón por la que esta página está construida como está, no una nota al pie. Tengo un lado. Por eso la regla que escoge a los miembros de comparación funciona igual en las dos bancadas, un tercio de las preguntas se reserva para votos en los que los dos partidos estuvieron de acuerdo, la regla de selección tiene nombre y está publicada, y cada voto, conteo y calificación está en un archivo que usted puede descargar y verificar. Nada de eso le pide que confíe en mí. Ese es exactamente el punto.",
    "author.job": "A qué me dedico. Trabajo como arquitecto de soluciones en el sector energético. El sector compra y vende energía, lo cual se cruza con los votos sobre servicios públicos de esta página, así que debería ponderar en consecuencia lo que yo diga sobre esos. Mi empleador no tuvo participación en esto, no lo financió y no lo revisó. No hago ningún tipo de trabajo político remunerado.",
    "author.races": "Yo escogí estas tres contiendas. Gobernador, Vicegobernador y Senado de Estados Unidos. Esa es una decisión editorial, no una medición, y es la elección que más vale la pena discutir. Las escogí porque los tres candidatos demócratas están en la Cámara de Texas, lo que significa que sus historiales se pueden comparar con sus respuestas voto por voto. Los de sus oponentes no, así que esta página no les da ninguna calificación en lugar de darles una inventada.",
    "author.why": "Por qué lo hice. Casi todo lo que llega a la gente sobre cómo se gobierna realmente su estado llega ya enmarcado por alguien que quiere algo. Los votos en sí son públicos, tediosos y de verdad difíciles de alcanzar. Quería una manera de ver el registro antes de ver la etiqueta, y de entregar el archivo completo para que cualquiera pueda verificar que el registro es lo que yo digo que es.",
    "author.contact": "Si algo aquí está mal, dígamelo: {email}. Las correcciones se hacen y se anotan en la página.",
    "mode.short": "7 temas grandes",
    "mode.full": "Los {n} votos",
    "mode.shortDesc": "Siete de las peleas más grandes de la sesión: los proyectos que el Vicegobernador declaró prioridad, o que el Gobernador vetó. Cada uno muestra por qué fue escogido.",
    "mode.fullDesc": "Los {n} votos: uno por proyecto, repartidos en 20 áreas temáticas por una regla escrita, con un tercio de los lugares reservado para votos en los que los dos partidos estuvieron de acuerdo.",
    "cand.note": "Los tres estuvieron en la misma cámara y compiten por cargos distintos, así que estas son tres lecturas separadas, no una clasificación. Votaron juntos en la mayoría de los proyectos de línea partidista, así que espere que las cifras queden cerca; donde se separan es la parte interesante. Cobertura sobre estos {items} votos: {coverage}. Un voto que no emitieron se descarta solo para ellos, no se cuenta en su contra.",
    "stmt.heading": "Declaraciones de voto",
    "stmt.note": "Un miembro de Texas puede presentar una declaración diciendo que el Diario lo registró mal. El voto registrado es el acto oficial y es lo que se califica aquí; la declaración se muestra al lado, nunca se aplica en su lugar.",
    "preset.heading": "Pruebe un perfil",
    "preset.mixed": "Votante con presiones cruzadas",
    "preset.muted": "Solo votos de señal baja",
    "preset.consistent": "Partidista consistente",
    "preset.reset": "Limpiar",
    "preset.note": "Los dos primeros producen casi la misma inclinación neta: una sola muestra mezclada pintaría ambos del mismo morado. Son hallazgos opuestos, así que la lectura los separa por carga partidista.",
    "ui.showTable": "Mostrar tabla",
    "ui.hideTable": "Ocultar tabla",
    "ui.methodHeading": "Cómo está construido esto",
    "ui.officialCaption": "Título oficial, tal como fue registrado",
    "ui.translationNotice": "El español aquí es nuestra traducción, no una versión oficial. El texto oficial de cada proyecto de ley está en inglés y está a un toque de distancia en cada pregunta.",
    "noun.vote.one": "voto",
    "noun.vote.many": "votos",
    "party.D": "los demócratas",
    "party.R": "los republicanos",
    "verdict.mildLean.headline": "Se inclina hacia {party}",
    "verdict.mildLean.caveat": "Más de sus respuestas coincidieron con ese partido que con el otro.",
  },
};

/**
 * Which strings a reviewer has signed off, by locale.
 *
 * Spanish rows still marked `draft` in copy.json are listed here so the page
 * can be honest about it: a build that ships unapproved Spanish should say so
 * rather than presenting a machine draft as a translation.
 */
export const ES_UNAPPROVED: readonly CopyKey[] = [

];
