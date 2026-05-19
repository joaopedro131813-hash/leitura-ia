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

function classificarFaseUmPorForma(avaliacao) {
  const { total, leiturasSilabicas, leiturasEmBloco, naoLidas, mediaSimilaridade } =
    avaliacao;
  const pctSilabica = total > 0 ? (leiturasSilabicas / total) * 100 : 0;
  const pctBloco = total > 0 ? (leiturasEmBloco / total) * 100 : 0;
  const pctNaoLida = total > 0 ? (naoLidas / total) * 100 : 0;

  if (pctNaoLida >= 60 || (pctSilabica >= 70 && pctBloco < 15)) {
    return {
      nivel: "Pré-leitor",
      cor: "text-rose-700",
      observacao:
        "A leitura ainda aparece muito fragmentada, como se as palavras fossem lidas em pedaços ou poucas fossem reconhecidas de uma vez.",
    };
  }

  if (pctSilabica >= 45 && pctBloco < 50) {
    return {
      nivel: "Leitor silábico",
      cor: "text-amber-700",
      observacao: `Em ${leiturasSilabicas} de ${total} palavras, a fala veio em partes (ex.: sílaba por sílaba), e não como uma palavra inteira.`,
    };
  }

  if (pctBloco >= 55 && mediaSimilaridade >= 70) {
    return {
      nivel: "Leitor fluente",
      cor: "text-emerald-700",
      observacao: `Em ${leiturasEmBloco} de ${total} palavras, o aluno tentou falar a palavra inteira, com boa aproximação ao esperado.`,
    };
  }

  return {
    nivel: "Leitor iniciante",
    cor: "text-sky-700",
    observacao: `Há mistura de leitura em partes (${leiturasSilabicas}) e palavras inteiras (${leiturasEmBloco}), sinal de transição entre sílabas e palavras.`,
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
      ? classificarFaseUmPorForma(avaliacaoFaseUm)
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
        ? "Classificação pela forma de leitura: palavra inteira ou em partes/sílabas, a partir da transcrição da fala."
        : "Classificação inicial por tempo de leitura.",
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
    <main className="min-h-screen px-4 py-8 text-slate-950 sm:px-8">
      <input id="texto-avaliacao-fixo" type="hidden" value={TEXTOS_AVALIACAO[currentPart]} />
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2.5rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.10),transparent_20%),linear-gradient(180deg,#eaf2ff,#d8e5f0)] p-6 shadow-[0_40px_80px_-40px_rgba(96,165,250,0.14)]">
          <div className="absolute -left-12 top-10 h-24 w-24 rounded-full bg-cyan-200/18 blur-3xl" />
          <div className="absolute right-8 top-12 h-32 w-32 rounded-full bg-rose-200/12 blur-3xl" />
          <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-slate-100/55 blur-3xl" />
          <div className="grid gap-6 sm:p-4 lg:grid-cols-[1fr_300px] relative">
            <div className="flex flex-col justify-center gap-4">
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
                Avaliação de fluência leitora
              </h1>
              <p className="max-w-2xl text-lg font-medium text-slate-700">
                Ajude o aluno a treinar a leitura com confiança, receber feedback instantâneo e se divertir como se estivesse em uma aventura escolar.
              </p>
            </div>

            <div className="relative flex min-h-[240px] items-center justify-center rounded-[2rem] border border-slate-200/60 bg-white/80 p-5 shadow-[0_30px_80px_-40px_rgba(96,165,250,0.18)]">
              <div className="relative h-48 w-48 rounded-full bg-gradient-to-br from-cyan-200/80 via-fuchsia-200/70 to-slate-100 shadow-[0_0_0_40px_rgba(96,165,250,0.14)]">
                <div className="absolute inset-0 rounded-full border border-slate-200/50" />
                <div className="absolute left-4 top-6 h-4 w-4 rounded-full bg-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.35)]" />
                <div className="absolute right-5 top-12 h-6 w-6 rounded-full bg-cyan-100/90" />
                <div className="absolute left-12 bottom-10 text-center">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-3xl font-black text-white shadow-[0_20px_30px_-20px_rgba(15,23,42,0.2)]">
                    A+
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-[1.75rem] border border-cyan-300/15 bg-white/5 p-5 text-slate-100 shadow-[0_20px_60px_-35px_rgba(56,189,248,0.14)] backdrop-blur-xl">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-300/15 text-3xl shadow-[0_10px_30px_-15px_rgba(56,189,248,0.35)]">
              📚
            </div>
            <h3 className="text-xl font-black text-slate-950">Treino de leitura</h3>
            <p className="mt-3 text-sm text-slate-500">
              Palavras aparecem uma a uma para a criança praticar a leitura em voz alta.
            </p>
          </article>

          <article className="rounded-[1.75rem] border border-violet-300/15 bg-white/5 p-5 text-slate-100 shadow-[0_20px_60px_-35px_rgba(168,85,247,0.14)] backdrop-blur-xl">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-300/15 text-3xl shadow-[0_10px_30px_-15px_rgba(168,85,247,0.35)]">
              🎙️
            </div>
            <h3 className="text-xl font-black text-slate-950">Feedback instantâneo</h3>
            <p className="mt-3 text-sm text-slate-500">
              O sistema ouve, transcreve e dá uma nota simpática para cada leitura.
            </p>
          </article>

          <article className="rounded-[1.75rem] border border-amber-300/15 bg-white/5 p-5 text-slate-100 shadow-[0_20px_60px_-35px_rgba(251,191,36,0.14)] backdrop-blur-xl">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-300/15 text-3xl shadow-[0_10px_30px_-15px_rgba(251,191,36,0.35)]">
              🚀
            </div>
            <h3 className="text-xl font-black text-slate-950">Jornada divertida</h3>
            <p className="mt-3 text-sm text-slate-500">
              Um ambiente alegre e colorido para crianças se sentirem seguras ao ler.
            </p>
          </article>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-[1.5rem] border border-slate-200/70 bg-slate-200/80 p-5 shadow-[0_20px_50px_-25px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <h2 className="text-2xl font-black text-slate-950">Dados da avaliação</h2>

            <label className="mt-5 block text-sm font-bold text-slate-900">
              Nome do aluno
              <input
                id="aluno-avaliacao"
                value={aluno}
                onChange={(event) => setAluno(event.target.value)}
                placeholder="Ex.: Ana Clara"
                className="mt-2 w-full rounded-3xl border border-cyan-300/30 bg-white px-4 py-3 text-slate-900 outline-none shadow-[0_15px_35px_-25px_rgba(56,189,248,0.25)] focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
              />
            </label>

            <label className="mt-5 block text-sm font-bold text-slate-900">
              Turma
              <input
                id="turma-avaliacao"
                value={turma}
                onChange={(event) => setTurma(event.target.value)}
                placeholder="Ex.: 2 ano A"
                className="mt-2 w-full rounded-3xl border border-cyan-300/30 bg-white px-4 py-3 text-slate-900 outline-none shadow-[0_15px_35px_-25px_rgba(56,189,248,0.25)] focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
              />
            </label>

            <div className="mt-6 rounded-[1.75rem] border border-slate-200/50 bg-slate-200/85 p-4 text-sm font-bold text-slate-900 shadow-[0_15px_45px_-30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <p className="flex justify-between gap-3 border-b border-slate-300/40 pb-2">
                <span>Texto</span>
                <span>Parte {currentPart + 1} de {TEXTOS_AVALIACAO.length}</span>
              </p>
              <p className="flex justify-between gap-3 border-b border-slate-700/40 py-2">
                <span>Palavras</span>
                <span>{quantidadePalavras}</span>
              </p>
              <p className="flex justify-between gap-3 pt-2">
                <span>Tempo</span>
                <span>{tempo || 0}s</span>
              </p>
            </div>
          </aside>

          <section className="rounded-[1.75rem] border border-slate-200/60 bg-slate-200/80 p-5 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
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
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 bg-white text-xl font-black text-slate-900 shadow-[2px_2px_0_#0f172a] transition hover:-translate-x-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                      >
                        ←
                      </button>
                    )}
                    <h2 className="text-2xl font-black">Texto para leitura</h2>
                  </div>
                  <div className="flex gap-2">
                    <span className="h-8 w-8 rounded-md border-2 border-slate-900 bg-rose-300" />
                    <span className="h-8 w-8 rounded-md border-2 border-slate-900 bg-cyan-300" />
                    <span className="h-8 w-8 rounded-md border-2 border-slate-900 bg-amber-300" />
                  </div>
                </div>
                <div className="mt-4 rounded-[1.75rem] border border-slate-200/60 bg-slate-950/5 p-6 text-2xl font-semibold leading-relaxed text-slate-900 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                  {currentPart === 0 ? (
                    <div className="space-y-4">
                      <div className="text-center text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
                        Leia em voz alta a palavra que aparece. Tente falar a palavra inteira de uma vez.
                      </div>
                      <div className="min-h-[5rem] flex items-center justify-center text-5xl font-black text-slate-950">
                        {palavrasExibidasCompletas
                          ? ""
                          : wordVisible
                            ? palavrasTextoAtual[currentWordIndex]
                            : ""}
                      </div>
                      {gravando && (
                        <p className="rounded-full bg-cyan-100 px-4 py-3 text-center text-sm font-bold text-slate-900 shadow-[0_10px_20px_-10px_rgba(14,165,233,0.25)]">
                          Tempo de leitura: {tempoDecorridoFaseUm}s
                        </p>
                      )}
                      {palavrasExibidasCompletas && gravando && (
                        <p className="rounded-full bg-amber-100 px-4 py-3 text-center text-sm font-bold text-amber-950 shadow-[0_10px_20px_-10px_rgba(245,158,11,0.25)]">
                          Todas as palavras foram exibidas. Clique em Parar quando terminar de ler.
                        </p>
                      )}
                      {resultado?.avaliacaoFaseUm && currentPart === 0 && (
                        <div className="mt-4 rounded-lg border-2 border-slate-900 bg-white p-4 text-sm text-slate-900 shadow-[3px_3px_0_#0f172a]">
                          <p className="font-bold">Resultado da primeira fase</p>
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
                    </div>
                  ) : (
                    TEXTOS_AVALIACAO[currentPart]
                  )}
                </div>
              </div>

              {erro && (
                <p className="rounded-md border-2 border-amber-500 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-950">
                  {erro}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {!gravando ? (
                  <button
                    id="botao-iniciar-gravacao"
                    type="button"
                    onClick={acionarInicio}
                    className="futuristic-btn rounded-full px-6 py-4 text-lg font-black transition hover:-translate-y-0.5 hover:scale-[1.01]"
                  >
                    Iniciar gravação
                  </button>
                ) : (
                  <button
                    id="botao-parar-gravacao"
                    type="button"
                    onClick={acionarParada}
                    className="futuristic-btn rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-500 to-cyan-400 px-6 py-4 text-lg font-black transition hover:-translate-y-0.5 hover:scale-[1.01]"
                  >
                    Parar gravação
                  </button>
                )}

                {gravando && (
                  <span className="rounded-md border-2 border-rose-500 bg-rose-100 px-3 py-2 text-sm font-black text-rose-950">
                    Gravando leitura...
                  </span>
                )}

                {processando && (
                  <span className="rounded-md border-2 border-cyan-500 bg-cyan-100 px-3 py-2 text-sm font-black text-cyan-950">
                    Processando resultado...
                  </span>
                )}
              </div>

              <p className="rounded-[1.5rem] border border-slate-200/60 bg-slate-100/85 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                Status: <span id="status-gravacao">{statusGravacao}</span>
              </p>

              {audioUrl && (
                <div className="rounded-[1.5rem] border border-slate-200/60 bg-slate-100/85 p-4 shadow-[0_15px_40px_-25px_rgba(14,165,233,0.12)] backdrop-blur-xl">
                  <p className="mb-3 text-sm font-black text-slate-900">
                    Gravação capturada
                  </p>
                  <audio controls src={audioUrl} className="w-full rounded-3xl bg-slate-100" />
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
                <div className="rounded-lg border-2 border-slate-200 bg-slate-100/90 p-4 shadow-[0_15px_30px_-15px_rgba(15,23,42,0.08)]">
                  <p className="mb-2 text-sm font-black text-slate-800">
                    Transcrição capturada
                  </p>
                  <p className="text-slate-900">{transcricao}</p>
                </div>
              )}

              {resultado && (
                <div className="grid gap-4 rounded-[1.75rem] border border-slate-200/70 bg-slate-100/90 p-5 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.08)] sm:grid-cols-3 backdrop-blur-xl">
                  <div className="sm:col-span-3">
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">
                      Classificação
                    </p>
                    <p className={`mt-2 text-3xl font-bold ${resultado.cor}`}>
                      {resultado.nivel}
                    </p>
                    <p className="mt-2 font-medium text-slate-700">{resultado.observacao}</p>
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-500">Tempo</p>
                    <p className="text-2xl font-semibold">{resultado.tempo}s</p>
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-500">Palavras</p>
                    <p className="text-2xl font-semibold">{resultado.palavras}</p>
                  </div>

                  {resultado.avaliacaoFaseUm ? (
                    <>
                      <div>
                        <p className="text-sm font-bold text-slate-500">Palavra inteira</p>
                        <p className="text-2xl font-semibold">
                          {resultado.avaliacaoFaseUm.leiturasEmBloco}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-500">Em partes</p>
                        <p className="text-2xl font-semibold">
                          {resultado.avaliacaoFaseUm.leiturasSilabicas}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-slate-500">Ritmo</p>
                      <p className="text-2xl font-semibold">
                        {resultado.palavrasPorMinuto} ppm
                      </p>
                    </div>
                  )}

                  {resultado.precisao !== undefined && !resultado.avaliacaoFaseUm && (
                    <div>
                      <p className="text-sm font-bold text-slate-500">Precisão</p>
                      <p className="text-2xl font-semibold">{resultado.precisao}%</p>
                    </div>
                  )}

                  <p className="text-sm font-medium text-slate-500 sm:col-span-3">
                    {resultado.origem}
                  </p>
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
                  className="mt-4 rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400/80 to-slate-100/90 px-6 py-4 text-lg font-black text-slate-950 shadow-[0_20px_60px_-35px_rgba(56,189,248,0.8)] transition hover:-translate-y-0.5 hover:scale-[1.01] hover:from-cyan-300/90 hover:to-slate-200/90"
                >
                  Próxima parte
                </button>
              )}

              {results.length === TEXTOS_AVALIACAO.length && (
                <div className="mt-6 rounded-lg border-4 border-slate-900 bg-white p-5 shadow-[6px_6px_0_#1e293b]">
                  <h3 className="text-2xl font-black">Resultados de todas as partes</h3>
                  {results.map((res, idx) => (
                    <div key={idx} className="mt-4 rounded-lg border-2 border-slate-300 bg-gray-50 p-4">
                      <p className="font-bold">Parte {res.part}: {res.nivel}</p>
                      <p>Tempo: {res.tempo}s, Ritmo: {res.palavrasPorMinuto} ppm</p>
                      {res.precisao !== undefined && <p>Precisão: {res.precisao}%</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
