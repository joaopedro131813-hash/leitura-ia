"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const UPLOAD_URL = "/api/upload";

const TEXTOS_AVALIACAO = [
  "A professora leu uma história.",
  "A professora leu uma história para a turma.",
  "A professora leu uma história para a turma. Depois, cada aluno contou a parte que mais gostou."
];

/** Ciclo visível/oculto de cada palavra na fase 1 (ms). */
const INTERVALO_CICLO_PALAVRA_MS = 1100;

function classificarFluencia(palavrasPorMinuto, precisao) {
  if (precisao !== undefined) {
    if (precisao < 20) {
      return {
        nivel: "Pré-leitor",
        cor: "text-rose-700",
        observacao: "Poucas palavras foram lidas corretamente.",
      };
    }

    if (precisao < 55 || palavrasPorMinuto < 35) {
      return {
        nivel: "Leitor silábico",
        cor: "text-amber-700",
        observacao:
          "A leitura está sendo feita de forma devagar ou com erros em várias palavras.",
      };
    }

    if (precisao < 85 || palavrasPorMinuto < 75) {
      return {
        nivel: "Leitor iniciante",
        cor: "text-sky-700",
        observacao:
          "A maioria das palavras foi lida corretamente, mas ainda há espaço para evolução.",
      };
    }

    return {
      nivel: "Leitor fluente",
        cor: "text-emerald-700",
      observacao:
        "A leitura está rápida e com boa correspondência às palavras esperadas.",
    };
  }

  if (palavrasPorMinuto < 15) {
    return {
      nivel: "Pré-leitor",
      cor: "text-rose-700",
      observacao: "Leitura muito inicial ou com pouca produção oral registrada.",
    };
  }

  if (palavrasPorMinuto < 35) {
    return {
      nivel: "Leitor silábico",
      cor: "text-amber-700",
      observacao:
        "Leitura lenta, possivelmente marcada por pausas e decodificação sílaba por sílaba.",
    };
  }

  if (palavrasPorMinuto < 75) {
    return {
      nivel: "Leitor iniciante",
      cor: "text-sky-700",
      observacao:
        "Leitura em desenvolvimento, com ritmo suficiente para acompanhar textos simples.",
    };
  }

  return {
    nivel: "Leitor fluente",
        cor: "text-emerald-700",
    observacao:
      "Leitura com bom ritmo. A precisão deve ser confirmada pela comparação com o texto.",
  };
}

function normalizarTexto(valor) {
  return valor
    .normalize("NFD")
    .toLowerCase()
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}

function contarSilabasPalavra(palavra) {
  const texto = normalizarTexto(palavra).replace(/\s/g, "");
  if (!texto) {
    return 0;
  }

  let silabas = 0;
  let vogalAnterior = false;

  for (const letra of texto) {
    const ehVogal = "aeiou".includes(letra);
    if (ehVogal && !vogalAnterior) {
      silabas += 1;
    }
    vogalAnterior = ehVogal;
  }

  return Math.max(1, silabas);
}

function distanciaLevenshtein(a, b) {
  let anterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);
  let atual = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    atual[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
    }

    [anterior, atual] = [atual, anterior];
  }

  return anterior[b.length];
}

function similaridadeTexto(a, b) {
  if (!a && !b) {
    return 1;
  }
  if (!a || !b) {
    return 0;
  }

  const distancia = distanciaLevenshtein(a, b);
  return 1 - distancia / Math.max(a.length, b.length);
}

function analisarFormaDaPalavra(tokens, indiceInicial, palavraEsperada) {
  const esperada = normalizarTexto(palavraEsperada);
  const silabasEsperadas = contarSilabasPalavra(esperada);

  if (indiceInicial >= tokens.length) {
    return {
      palavra: esperada,
      modo: "nao_lida",
      formaLeitura: "Não identificada na gravação",
      tokensLidos: [],
      similaridade: 0,
      correto: false,
      proximoIndice: indiceInicial,
      silabasEsperadas,
    };
  }

  const limiteTokens = Math.min(tokens.length - indiceInicial, silabasEsperadas + 2);
  let melhor = null;

  for (let quantidade = 1; quantidade <= limiteTokens; quantidade += 1) {
    const pedaco = tokens.slice(indiceInicial, indiceInicial + quantidade);
    const junto = pedaco.join("");
    const similaridade = similaridadeTexto(junto, esperada);
    const umToken = quantidade === 1;
    const leituraSilabica =
      quantidade >= 2 ||
      (umToken &&
        similaridade < 0.72 &&
        junto.length < esperada.length * 0.55 &&
        silabasEsperadas > 1);
    const leituraEmBloco =
      umToken &&
      (similaridade >= 0.45 || junto.length >= esperada.length * 0.65);

    let modo = null;
    let formaLeitura = "";

    if (leituraSilabica && !leituraEmBloco) {
      modo = "silabica";
      formaLeitura =
        quantidade >= 2
          ? `Em partes (${pedaco.join(" · ")})`
          : "Apenas parte da palavra";
    } else if (leituraEmBloco) {
      modo = "bloco";
      formaLeitura =
        similaridade >= 0.82
          ? "Palavra inteira"
          : "Palavra inteira com pronúncia aproximada";
    }

    if (!modo) {
      continue;
    }

    const candidato = {
      palavra: esperada,
      modo,
      formaLeitura,
      tokensLidos: pedaco,
      similaridade: Math.round(similaridade * 100),
      correto: similaridade >= 0.82,
      proximoIndice: indiceInicial + quantidade,
      silabasEsperadas,
    };

    if (
      !melhor ||
      candidato.similaridade > melhor.similaridade ||
      (candidato.modo === "bloco" && melhor.modo !== "bloco")
    ) {
      melhor = candidato;
    }

    if (modo === "bloco" && similaridade >= 0.55) {
      break;
    }
  }

  if (melhor) {
    return melhor;
  }

  const tokenAvulso = tokens[indiceInicial];
  const similaridadeAvulsa = similaridadeTexto(tokenAvulso, esperada);

  return {
    palavra: esperada,
    modo: similaridadeAvulsa >= 0.35 ? "silabica" : "nao_lida",
    formaLeitura:
      similaridadeAvulsa >= 0.35
        ? "Tentativa parcial ou silabada"
        : "Não identificada na gravação",
    tokensLidos: [tokenAvulso],
    similaridade: Math.round(similaridadeAvulsa * 100),
    correto: similaridadeAvulsa >= 0.82,
    proximoIndice: indiceInicial + 1,
    silabasEsperadas,
  };
}

function classificarFaseUmPorForma(avaliacao, duracao) {
  const {
    total,
    corretas,
    leiturasSilabicas,
    leiturasEmBloco,
    naoLidas,
    mediaSimilaridade,
    precisao,
  } = avaliacao;

  const pctSilabica = total > 0 ? (leiturasSilabicas / total) * 100 : 0;
  const pctBloco = total > 0 ? (leiturasEmBloco / total) * 100 : 0;
  const pctNaoLida = total > 0 ? (naoLidas / total) * 100 : 0;

  const palavrasPorMinuto =
    duracao > 0 ? Math.round((total / duracao) * 60) : 0;
  const ppmCorretas = duracao > 0 ? Math.round((corretas / duracao) * 60) : 0;

  const muitoLento = palavrasPorMinuto < 10;
  const lento = palavrasPorMinuto < 18;
  const ritmoBom = palavrasPorMinuto >= 22;

  const leuBem = precisao >= 75;
  const leuParcial = precisao >= 40;

  const leituraFragmentada = pctSilabica >= 45 && pctBloco < 50;
  const leituraEmBloco = pctBloco >= 50 && mediaSimilaridade >= 65;

  const tempoFormatado = duracao > 0 ? `${Number(duracao.toFixed(1))}s` : "—";
  const detalheConteudo = `Leu ${corretas} de ${total} palavras com ${precisao}% de precisão`;
  const detalheTempo = `em ${tempoFormatado} (${palavrasPorMinuto} palavras/min)`;

  const base = { palavrasPorMinuto, ppmCorretas };

  if (
    pctNaoLida >= 55 ||
    (precisao < 30 && muitoLento) ||
    (leituraFragmentada && muitoLento && !leuParcial)
  ) {
    return {
      ...base,
      nivel: "Pré-leitor",
      cor: "text-rose-700",
      observacao: `${detalheConteudo} ${detalheTempo}. Pouco foi reconhecido ou a leitura foi muito lenta e em pedaços.`,
    };
  }

  if (leituraFragmentada || (pctSilabica > pctBloco && !leituraEmBloco)) {
    const nivel = lento && precisao < 45 ? "Pré-leitor" : "Leitor silábico";
    return {
      ...base,
      nivel,
      cor: nivel === "Pré-leitor" ? "text-rose-700" : "text-amber-700",
      observacao: `${detalheConteudo} ${detalheTempo}. Em ${leiturasSilabicas} palavra(s) a fala veio em partes (sílaba a sílaba), não como palavra inteira.${
        lento ? " O tempo de leitura ainda está baixo." : ""
      }`,
    };
  }

  if (leituraEmBloco && leuBem && ritmoBom) {
    return {
      ...base,
      nivel: "Leitor fluente",
      cor: "text-emerald-700",
      observacao: `${detalheConteudo} ${detalheTempo}. Leu palavras inteiras com boa precisão e ritmo adequado.`,
    };
  }

  if (leituraEmBloco && (leuParcial || !lento)) {
    const nivel =
      leuBem && !lento ? "Leitor fluente" : "Leitor iniciante";
    return {
      ...base,
      nivel,
      cor: nivel === "Leitor fluente" ? "text-emerald-700" : "text-sky-700",
      observacao: `${detalheConteudo} ${detalheTempo}. Tenta falar a palavra inteira (${leiturasEmBloco} de ${total})${
        lento ? ", mas ainda precisa ganhar ritmo" : ", com precisão em desenvolvimento"
      }.`,
    };
  }

  if (leituraEmBloco && lento) {
    return {
      ...base,
      nivel: "Leitor iniciante",
      cor: "text-sky-700",
      observacao: `${detalheConteudo} ${detalheTempo}. Forma de leitura em palavra inteira, porém o tempo ainda está lento para o texto.`,
    };
  }

  return {
    ...base,
    nivel: "Leitor iniciante",
    cor: "text-sky-700",
    observacao: `${detalheConteudo} ${detalheTempo}. Mistura leitura em partes (${leiturasSilabicas}) e palavras inteiras (${leiturasEmBloco}).`,
  };
}

function avaliarFaseUm(transcricao, palavrasEsperadas) {
  const tokens = normalizarTexto(transcricao).split(/\s+/).filter(Boolean);
  let indice = 0;
  const palavras = [];

  for (const palavraEsperada of palavrasEsperadas) {
    const analise = analisarFormaDaPalavra(tokens, indice, palavraEsperada);
    indice = analise.proximoIndice;
    palavras.push(analise);
  }

  const leiturasSilabicas = palavras.filter((item) => item.modo === "silabica").length;
  const leiturasEmBloco = palavras.filter((item) => item.modo === "bloco").length;
  const naoLidas = palavras.filter((item) => item.modo === "nao_lida").length;
  const corretas = palavras.filter((item) => item.correto).length;
  const mediaSimilaridade =
    palavras.length > 0
      ? Math.round(
          palavras.reduce((soma, item) => soma + item.similaridade, 0) / palavras.length,
        )
      : 0;

  return {
    corretas,
    total: palavrasEsperadas.length,
    palavras,
    leiturasSilabicas,
    leiturasEmBloco,
    naoLidas,
    mediaSimilaridade,
    precisao: Math.round((corretas / palavrasEsperadas.length) * 100),
  };
}

export default function Home() {
  const [gravando, setGravando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [aluno, setAluno] = useState("");
  const [turma, setTurma] = useState("");
  const [tempo, setTempo] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [transcricao, setTranscricao] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [statusGravacao, setStatusGravacao] = useState("Pronto para iniciar.");
  const [currentPart, setCurrentPart] = useState(0);
  const [results, setResults] = useState([]);
  const [showNextButton, setShowNextButton] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [palavrasExibidasCompletas, setPalavrasExibidasCompletas] = useState(false);
  const [tempoDecorridoFaseUm, setTempoDecorridoFaseUm] = useState(0);

  const inicioLeitura = useRef(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const streamAtual = useRef(null);
  const reconhecimentoVoz = useRef(null);
  const transcricaoAtual = useRef("");
  const wordTimerRef = useRef(null);
  const tempoProgressivoRef = useRef(null);
  const currentIndexRef = useRef(0);
  const visibleRef = useRef(true);

  const palavrasTextoAtual = useMemo(
    () => TEXTOS_AVALIACAO[currentPart].trim().split(/\s+/),
    [currentPart],
  );

  const quantidadePalavras = palavrasTextoAtual.length;

  function limparTimersFaseUm() {
    if (wordTimerRef.current) {
      window.clearInterval(wordTimerRef.current);
      wordTimerRef.current = null;
    }
    if (tempoProgressivoRef.current) {
      window.clearInterval(tempoProgressivoRef.current);
      tempoProgressivoRef.current = null;
    }
  }

  function iniciarTimersFaseUm() {
    limparTimersFaseUm();
    
    currentIndexRef.current = 0;
    visibleRef.current = true;
    
    setCurrentWordIndex(0);
    setWordVisible(true);
    setPalavrasExibidasCompletas(false);
    setTempoDecorridoFaseUm(0);

    tempoProgressivoRef.current = window.setInterval(() => {
      setTempoDecorridoFaseUm((atual) => atual + 1);
    }, 1000);

    const totalPalavras = palavrasTextoAtual.length;

    wordTimerRef.current = window.setInterval(() => {
      if (visibleRef.current) {
        setWordVisible(false);
        visibleRef.current = false;
        return;
      }

      if (currentIndexRef.current + 1 >= totalPalavras) {
        if (wordTimerRef.current) {
          window.clearInterval(wordTimerRef.current);
          wordTimerRef.current = null;
        }
        setPalavrasExibidasCompletas(true);
        return;
      }

      currentIndexRef.current += 1;
      setCurrentWordIndex(currentIndexRef.current);
      setWordVisible(true);
      visibleRef.current = true;
    }, INTERVALO_CICLO_PALAVRA_MS);
  }

  async function iniciarLeitura() {
    if (gravando || processando) {
      return;
    }

    setStatusGravacao("Botão acionado. Solicitando permissão do microfone...");
    setErro("Aguardando permissão do microfone...");
    setResultado(null);
    setTempo(0);
    setAudioUrl("");
    setTranscricao("");
    setCurrentWordIndex(0);
    setWordVisible(true);
    setPalavrasExibidasCompletas(false);
    setTempoDecorridoFaseUm(0);
    currentIndexRef.current = 0;
    visibleRef.current = true;
    limparTimersFaseUm();
    audioChunks.current = [];
    transcricaoAtual.current = "";

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatusGravacao("Captura de áudio indisponível neste navegador.");
        setErro("Este navegador não permite captura de áudio nesta página.");
        return;
      }

      if (!window.MediaRecorder) {
        setStatusGravacao("Gravação de áudio indisponível neste navegador.");
        setErro("Este navegador não oferece suporte para gravação de áudio.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatusGravacao("Microfone liberado. Preparando gravação...");
      streamAtual.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;

      recorder.ondataavailable = (event) => {
        setStatusGravacao("Áudio recebido pelo navegador.");
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setStatusGravacao("Erro durante a gravação do áudio.");
        setErro("O navegador interrompeu a gravação. Tente novamente.");
      };

      recorder.onstop = finalizarGravacao;
      // Timestamp captured in a user event, used only to measure recording duration.
      // eslint-disable-next-line react-hooks/purity
      inicioLeitura.current = Date.now();
      recorder.start();
      setGravando(true);
      setStatusGravacao("Gravando. Leia o texto em voz alta.");
      setErro("");

      if (currentPart === 0) {
        iniciarTimersFaseUm();
      }

      iniciarReconhecimentoVoz();
    } catch (error) {
      streamAtual.current?.getTracks().forEach((track) => track.stop());
      setStatusGravacao("Microfone não liberado.");
      setErro(
        `Não foi possível acessar o microfone. ${error?.message ?? "Clique no cadeado do navegador e permita o uso do microfone."}`,
      );
    }
  }

  function iniciarReconhecimentoVoz() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErro(
        "Seu navegador não oferece transcrição automática. A avaliação será feita pelo tempo de leitura.",
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let textoReconhecido = "";

      for (let index = 0; index < event.results.length; index += 1) {
        textoReconhecido += `${event.results[index][0].transcript} `;
      }

      const textoLimpo = textoReconhecido.trim();
      transcricaoAtual.current = textoLimpo;
      setTranscricao(textoLimpo);
    };

    recognition.onerror = () => {
      setErro(
        "A transcrição automática falhou. A gravação continua e a avaliação usará o tempo de leitura.",
      );
    };

    reconhecimentoVoz.current = recognition;
    try {
      recognition.start();
    } catch {
      setErro(
        "A gravação iniciou, mas a transcrição automática não foi ativada neste navegador.",
      );
    }
  }

  useEffect(() => {
    return () => {
      limparTimersFaseUm();
    };
  }, []);

  function pararLeitura() {
    limparTimersFaseUm();

    if (!mediaRecorder.current || mediaRecorder.current.state === "inactive") {
      return;
    }

    const fimLeitura = Date.now();
    const duracao = Number(((fimLeitura - inicioLeitura.current) / 1000).toFixed(2));

    setTempo(duracao);
    setGravando(false);
    setStatusGravacao("Gravação finalizada. Processando resultado...");
    reconhecimentoVoz.current?.stop();
    mediaRecorder.current.stop();
    streamAtual.current?.getTracks().forEach((track) => track.stop());
  }

  function acionarInicio(event) {
    event.preventDefault();
    iniciarLeitura();
  }

  function acionarParada(event) {
    event.preventDefault();
    pararLeitura();
  }

  function voltarEtapaAnterior() {
    if (currentPart === 0 || gravando || processando) {
      return;
    }

    limparTimersFaseUm();

    const novaParte = currentPart - 1;
    const numeroParte = novaParte + 1;
    const resultadoSalvo = results.find((item) => item.part === numeroParte);

    setResults((lista) => lista.filter((item) => item.part <= numeroParte));
    setCurrentPart(novaParte);
    setCurrentWordIndex(0);
    setWordVisible(true);
    setPalavrasExibidasCompletas(false);
    setTempoDecorridoFaseUm(0);
    currentIndexRef.current = 0;
    visibleRef.current = true;
    setShowNextButton(Boolean(resultadoSalvo));
    setResultado(resultadoSalvo || null);
    setAudioUrl("");
    setTranscricao("");
    setTempo(resultadoSalvo?.tempo ?? 0);
    setErro("");
    setStatusGravacao(
      resultadoSalvo
        ? "Etapa anterior. Você pode gravar de novo ou seguir para a próxima parte."
        : "Pronto para iniciar.",
    );
  }

  async function finalizarGravacao() {
    const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
    const url = URL.createObjectURL(audioBlob);
    const duracao = Number(((Date.now() - inicioLeitura.current) / 1000).toFixed(2));

    const avaliacaoFaseUm = currentPart === 0
      ? avaliarFaseUm(transcricaoAtual.current || "", palavrasTextoAtual)
      : undefined;

    const classificacao = currentPart === 0 && avaliacaoFaseUm
      ? classificarFaseUmPorForma(avaliacaoFaseUm, duracao)
      : classificarFluencia(
          duracao > 0 ? Math.round((quantidadePalavras / duracao) * 60) : 0,
          avaliacaoFaseUm?.precisao,
        );

    setAudioUrl(url);
    setProcessando(true);
    setStatusGravacao("Resultado em processamento.");

    const palavrasPorMinuto =
      duracao > 0 ? Math.round((quantidadePalavras / duracao) * 60) : 0;

    const resultadoLocal = {
      ...classificacao,
      tempo: duracao,
      palavras: quantidadePalavras,
      palavrasPorMinuto,
      precisao: avaliacaoFaseUm?.precisao,
      transcricao: transcricaoAtual.current || "Transcrição automática não capturada.",
      avaliacaoFaseUm,
      origem: currentPart === 0
        ? "Classificação pelo que o aluno leu (precisão e forma: palavra inteira ou em partes) e pelo tempo da leitura."
        : "Classificação pelo que foi lido e pelo tempo de leitura.",
    };

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "leitura.webm");
      formData.append("aluno", aluno);
      formData.append("turma", turma);
      formData.append("texto", TEXTOS_AVALIACAO[currentPart]);
      formData.append("tempo", String(duracao));
      formData.append("transcricao", transcricaoAtual.current);

      const resposta = await fetch(UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      if (!resposta.ok) {
        const erroTexto = await resposta.text().catch(() => resposta.statusText);
        throw new Error(`Upload falhou (${resposta.status}: ${erroTexto})`);
      }

      const dados = await resposta.json();
      setResultado(
        currentPart === 0
          ? { ...dados, ...resultadoLocal }
          : { ...resultadoLocal, ...dados },
      );
    } catch (erro) {
      console.error("Erro ao chamar API de upload:", erro);
      setResultado(resultadoLocal);
      setErro(`Falha ao enviar dados para o servidor. ${erro?.message || ""}`);
    } finally {
      setResults(prev => [...prev, { ...resultadoLocal, part: currentPart + 1 }]);
      setShowNextButton(true);
      setProcessando(false);
      setStatusGravacao("Avaliação concluída.");
      audioChunks.current = [];
    }
  }

  return (
    <main className="app-shell">
      <input id="texto-avaliacao-fixo" type="hidden" value={TEXTOS_AVALIACAO[currentPart]} />
      <div className="app-container">
        <header className="app-header">
          <h1>Avaliação de fluência leitora</h1>
          <p>
            Grave a leitura do aluno, acompanhe o progresso em três etapas e receba uma
            classificação com base na fala e no tempo.
          </p>
          <div className="steps-bar" role="list" aria-label="Etapas da avaliação">
            {TEXTOS_AVALIACAO.map((_, indice) => {
              const numero = indice + 1;
              const ativa = indice === currentPart;
              const concluida = results.some((item) => item.part === numero);
              return (
                <span
                  key={numero}
                  role="listitem"
                  className={`step-pill${ativa ? " active" : ""}${concluida && !ativa ? " done" : ""}`}
                >
                  Parte {numero}
                </span>
              );
            })}
          </div>
        </header>

        <div className="workspace">
          <aside className="card card-padded">
            <h2 className="panel-title">Dados da avaliação</h2>

            <label className="field-label" htmlFor="aluno-avaliacao">
              Nome do aluno
              <input
                id="aluno-avaliacao"
                value={aluno}
                onChange={(event) => setAluno(event.target.value)}
                placeholder="Ex.: Ana Clara"
                className="field-input"
              />
            </label>

            <label className="field-label" htmlFor="turma-avaliacao">
              Turma
              <input
                id="turma-avaliacao"
                value={turma}
                onChange={(event) => setTurma(event.target.value)}
                placeholder="Ex.: 2 ano A"
                className="field-input"
              />
            </label>

            <div className="stats-box">
              <div className="stats-row">
                <span>Etapa</span>
                <span>
                  {currentPart + 1} de {TEXTOS_AVALIACAO.length}
                </span>
              </div>
              <div className="stats-row">
                <span>Palavras</span>
                <span>{quantidadePalavras}</span>
              </div>
              <div className="stats-row">
                <span>Tempo</span>
                <span>{tempo || 0}s</span>
              </div>
            </div>
          </aside>

          <section className="card card-padded">
            <div className="flex flex-col gap-4">
              <div>
                <div className="reading-panel-header">
                  <div className="reading-title-row">
                    {currentPart > 0 && (
                      <button
                        type="button"
                        onClick={voltarEtapaAnterior}
                        disabled={gravando || processando}
                        aria-label="Voltar para a etapa anterior"
                        title={
                          gravando || processando
                            ? "Aguarde terminar a gravação para voltar"
                            : "Voltar para a etapa anterior"
                        }
                        className="btn-back"
                      >
                        ←
                      </button>
                    )}
                    <h2 className="panel-title">Texto para leitura</h2>
                  </div>
                </div>
                <div className="reading-stage">
                  {currentPart === 0 ? (
                    <>
                      <p className="reading-hint">
                        Leia em voz alta a palavra que aparece. Tente falar a palavra inteira de uma vez.
                      </p>
                      <div className="reading-word">
                        {palavrasExibidasCompletas
                          ? ""
                          : wordVisible
                            ? palavrasTextoAtual[currentWordIndex]
                            : ""}
                      </div>
                      {gravando && (
                        <p className="banner banner-info">
                          Tempo de leitura: {tempoDecorridoFaseUm}s
                        </p>
                      )}
                      {palavrasExibidasCompletas && gravando && (
                        <p className="banner banner-warn">
                          Todas as palavras foram exibidas. Clique em Parar quando terminar de ler.
                        </p>
                      )}
                      {resultado?.avaliacaoFaseUm && currentPart === 0 && (
                        <div className="mini-result">
                          <p className="font-bold">Resultado da primeira fase</p>
                          <p>
                            {resultado.avaliacaoFaseUm.corretas} de {resultado.avaliacaoFaseUm.total}{" "}
                            palavras ({resultado.precisao}%) · {resultado.tempo}s ·{" "}
                            {resultado.palavrasPorMinuto} ppm
                          </p>
                          <p>
                            Palavra inteira: {resultado.avaliacaoFaseUm.leiturasEmBloco} · Em
                            partes: {resultado.avaliacaoFaseUm.leiturasSilabicas}
                          </p>
                          <ul className="mt-3 space-y-2">
                            {resultado.avaliacaoFaseUm.palavras.map((item) => (
                              <li
                                key={item.palavra}
                                className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2"
                              >
                                <span className="font-semibold">{item.palavra}</span>
                                <span className="text-slate-600">{item.formaLeitura}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="reading-text-full">{TEXTOS_AVALIACAO[currentPart]}</p>
                  )}
                </div>
              </div>

              {erro && <p className="banner banner-error">{erro}</p>}

              <div className="actions-row">
                {!gravando ? (
                  <button
                    id="botao-iniciar-gravacao"
                    type="button"
                    onClick={acionarInicio}
                    className="btn-primary futuristic-btn"
                  >
                    Iniciar gravação
                  </button>
                ) : (
                  <button
                    id="botao-parar-gravacao"
                    type="button"
                    onClick={acionarParada}
                    className="btn-primary btn-danger futuristic-btn"
                  >
                    Parar gravação
                  </button>
                )}

                {gravando && (
                  <span className="badge badge-recording">Gravando…</span>
                )}

                {processando && (
                  <span className="badge badge-processing">Processando…</span>
                )}
              </div>

              <p className="status-bar">
                Status: <strong id="status-gravacao">{statusGravacao}</strong>
              </p>

              {audioUrl && (
                <div className="card card-padded">
                  <p className="panel-title mb-3">Gravação capturada</p>
                  <audio controls src={audioUrl} className="w-full" />
                </div>
              )}

              <div
                id="audio-fallback"
                className="hidden rounded-lg border-2 border-slate-200 bg-white p-4 shadow-[0_15px_30px_-15px_rgba(15,23,42,0.08)]"
              />

              <div
                id="resultado-fallback"
                className="hidden rounded-lg border-2 border-slate-200 bg-white p-5 shadow-[0_15px_30px_-15px_rgba(15,23,42,0.08)]"
              />

              {transcricao && (
                <div className="card card-padded">
                  <p className="panel-title mb-2">Transcrição capturada</p>
                  <p className="leading-relaxed text-slate-700">{transcricao}</p>
                </div>
              )}

              {resultado && (
                <div className="result-card">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Classificação
                    </p>
                    <p className={`result-level ${resultado.cor}`}>{resultado.nivel}</p>
                    <p className="mt-2 text-slate-600 leading-relaxed">{resultado.observacao}</p>
                  </div>
                  <div className="result-grid">
                  <div className="result-stat">
                    <label>Tempo</label>
                    <span>{resultado.tempo}s</span>
                  </div>

                  <div className="result-stat">
                    <label>Palavras</label>
                    <span>{resultado.palavras}</span>
                  </div>

                  {resultado.avaliacaoFaseUm ? (
                    <>
                      <div className="result-stat">
                        <label>Precisão</label>
                        <span>{resultado.precisao}%</span>
                      </div>
                      <div className="result-stat">
                        <label>Palavra inteira</label>
                        <span>{resultado.avaliacaoFaseUm.leiturasEmBloco}</span>
                      </div>
                      <div className="result-stat">
                        <label>Em partes</label>
                        <span>{resultado.avaliacaoFaseUm.leiturasSilabicas}</span>
                      </div>
                      <div className="result-stat">
                        <label>Ritmo</label>
                        <span>{resultado.palavrasPorMinuto} ppm</span>
                      </div>
                    </>
                  ) : (
                    <div className="result-stat">
                      <label>Ritmo</label>
                      <span>{resultado.palavrasPorMinuto} ppm</span>
                    </div>
                  )}

                  {resultado.precisao !== undefined && !resultado.avaliacaoFaseUm && (
                    <div className="result-stat">
                      <label>Precisão</label>
                      <span>{resultado.precisao}%</span>
                    </div>
                  )}
                  </div>
                  <p className="mt-4 text-sm text-slate-500">{resultado.origem}</p>
                </div>
              )}

              {showNextButton && currentPart < TEXTOS_AVALIACAO.length - 1 && (
                <button
                  onClick={() => {
                    limparTimersFaseUm();
                    setCurrentWordIndex(0);
                    setWordVisible(true);
                    setPalavrasExibidasCompletas(false);
                    setTempoDecorridoFaseUm(0);
                    currentIndexRef.current = 0;
                    visibleRef.current = true;
                    setCurrentPart(currentPart + 1);
                    setShowNextButton(false);
                    setResultado(null);
                    setAudioUrl("");
                    setTranscricao("");
                    setTempo(0);
                    setErro("");
                    setStatusGravacao("Pronto para iniciar.");
                  }}
                  className="btn-secondary mt-2"
                >
                  Próxima parte
                </button>
              )}

              {results.length === TEXTOS_AVALIACAO.length && (
                <div className="result-card mt-2">
                  <h3 className="panel-title">Resultados de todas as partes</h3>
                  {results.map((res, idx) => (
                    <div key={idx} className="mini-result mt-3">
                      <p className="font-semibold">
                        Parte {res.part}: {res.nivel}
                      </p>
                      <p className="mt-1 text-slate-600">
                        Tempo: {res.tempo}s · Ritmo: {res.palavrasPorMinuto} ppm
                        {res.precisao !== undefined && ` · Precisão: ${res.precisao}%`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
