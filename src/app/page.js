"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const UPLOAD_URL = "/api/upload";

const TEXTOS_AVALIACAO = [
  "A professora leu uma história.",
  "A professora leu uma história para a turma.",
  "A professora leu uma história para a turma. Depois, cada aluno contou a parte que mais gostou."
];

function classificarFluencia(palavrasPorMinuto, precisao) {
  if (precisao !== undefined) {
    if (precisao < 20) {
      return {
        nivel: "Pré-leitor",
        cor: "text-rose-300",
        observacao: "Poucas palavras foram lidas corretamente.",
      };
    }

    if (precisao < 55 || palavrasPorMinuto < 35) {
      return {
        nivel: "Leitor silábico",
        cor: "text-amber-300",
        observacao:
          "A leitura está sendo feita de forma devagar ou com erros em várias palavras.",
      };
    }

    if (precisao < 85 || palavrasPorMinuto < 75) {
      return {
        nivel: "Leitor iniciante",
        cor: "text-sky-300",
        observacao:
          "A maioria das palavras foi lida corretamente, mas ainda há espaço para evolução.",
      };
    }

    return {
      nivel: "Leitor fluente",
      cor: "text-emerald-300",
      observacao:
        "A leitura está rápida e com boa correspondência às palavras esperadas.",
    };
  }

  if (palavrasPorMinuto < 15) {
    return {
      nivel: "Pré-leitor",
      cor: "text-rose-300",
      observacao: "Leitura muito inicial ou com pouca produção oral registrada.",
    };
  }

  if (palavrasPorMinuto < 35) {
    return {
      nivel: "Leitor silábico",
      cor: "text-amber-300",
      observacao:
        "Leitura lenta, possivelmente marcada por pausas e decodificação sílaba por sílaba.",
    };
  }

  if (palavrasPorMinuto < 75) {
    return {
      nivel: "Leitor iniciante",
      cor: "text-sky-300",
      observacao:
        "Leitura em desenvolvimento, com ritmo suficiente para acompanhar textos simples.",
    };
  }

  return {
    nivel: "Leitor fluente",
    cor: "text-emerald-300",
    observacao:
      "Leitura com bom ritmo. A precisão deve ser confirmada pela comparação com o texto.",
  };
}

function classificarFaseUm(palavrasCorretas, duracao) {
  const palavrasCorretasPorMinuto = duracao > 0 ? Math.round((palavrasCorretas / duracao) * 60) : 0;

  if (palavrasCorretasPorMinuto < 10) {
    return {
      nivel: "Pré-leitor",
      cor: "text-rose-300",
      observacao: `Leu ${palavrasCorretas} palavra(s) corretamente. Ritmo muito lento.`,
      velocidade: palavrasCorretasPorMinuto,
    };
  }

  if (palavrasCorretasPorMinuto < 20) {
    return {
      nivel: "Leitor silábico",
      cor: "text-amber-300",
      observacao: `Leu ${palavrasCorretas} palavra(s) corretamente. Ritmo lento.`,
      velocidade: palavrasCorretasPorMinuto,
    };
  }

  if (palavrasCorretasPorMinuto < 35) {
    return {
      nivel: "Leitor iniciante",
      cor: "text-sky-300",
      observacao: `Leu ${palavrasCorretas} palavra(s) corretamente. Ritmo em desenvolvimento.`,
      velocidade: palavrasCorretasPorMinuto,
    };
  }

  return {
    nivel: "Leitor fluente",
    cor: "text-emerald-300",
    observacao: `Leu ${palavrasCorretas} palavra(s) corretamente. Ritmo bom!`,
    velocidade: palavrasCorretasPorMinuto,
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

function avaliarFaseUm(transcricao, palavrasEsperadas) {
  const transcricaoLimpa = normalizarTexto(transcricao);
  const palavrasLidas = transcricaoLimpa.split(/\s+/).filter(Boolean);
  const palavrasNormalizadas = palavrasEsperadas.map((palavra) => normalizarTexto(palavra));

  const status = palavrasNormalizadas.map((palavra) => {
    const encontrou = palavrasLidas.includes(palavra);
    return {
      palavra,
      correto: encontrou,
    };
  });

  const corretas = status.filter((item) => item.correto).length;

  return {
    corretas,
    total: palavrasEsperadas.length,
    status,
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
  const [tempoRestante, setTempoRestante] = useState(0);

  const inicioLeitura = useRef(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const streamAtual = useRef(null);
  const reconhecimentoVoz = useRef(null);
  const transcricaoAtual = useRef("");
  const wordTimerRef = useRef(null);
  const timeTimerRef = useRef(null);
  const currentIndexRef = useRef(0);
  const visibleRef = useRef(true);

  const palavrasTextoAtual = useMemo(
    () => TEXTOS_AVALIACAO[currentPart].trim().split(/\s+/),
    [currentPart],
  );

  const quantidadePalavras = palavrasTextoAtual.length;
  const tempoTotalLeitura = useMemo(
    () => Math.ceil(palavrasTextoAtual.length * 1.5),
    [palavrasTextoAtual],
  );

  function limparTimersFaseUm() {
    if (wordTimerRef.current) {
      window.clearInterval(wordTimerRef.current);
      wordTimerRef.current = null;
    }
    if (timeTimerRef.current) {
      window.clearInterval(timeTimerRef.current);
      timeTimerRef.current = null;
    }
  }

  function iniciarTimersFaseUm() {
    limparTimersFaseUm();
    
    currentIndexRef.current = 0;
    visibleRef.current = true;
    
    setCurrentWordIndex(0);
    setWordVisible(true);
    setTempoRestante(tempoTotalLeitura);

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
        return;
      }

      currentIndexRef.current += 1;
      setCurrentWordIndex(currentIndexRef.current);
      setWordVisible(true);
      visibleRef.current = true;
    }, 1400);

    timeTimerRef.current = window.setInterval(() => {
      setTempoRestante((atual) => {
        if (atual <= 1) {
          limparTimersFaseUm();
          if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
            pararLeitura();
          }
          return 0;
        }
        return atual - 1;
      });
    }, 1000);
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
    console.log("Botão iniciar clicado");
    iniciarLeitura();
  }

  function acionarParada(event) {
    event.preventDefault();
    console.log("Botão parar clicado");
    pararLeitura();
  }

  async function finalizarGravacao() {
    const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
    const url = URL.createObjectURL(audioBlob);
    const duracao = Number(((Date.now() - inicioLeitura.current) / 1000).toFixed(2));

    const avaliacaoFaseUm = currentPart === 0
      ? avaliarFaseUm(transcricaoAtual.current || "", palavrasTextoAtual)
      : undefined;

    const classificacao = currentPart === 0 && avaliacaoFaseUm
      ? classificarFaseUm(avaliacaoFaseUm.corretas, duracao)
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
        ? "Classificação por quantidade de palavras lidas corretamente."
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
      setResultado({ ...resultadoLocal, ...dados });
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
        <header className="overflow-hidden rounded-[2rem] border border-slate-200/60 bg-gradient-to-br from-white/95 via-slate-100/80 to-slate-950/5 p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          <div className="grid gap-6 sm:p-4 lg:grid-cols-[1fr_280px]">
            <div className="flex flex-col justify-center gap-4">
              <div className="flex flex-wrap gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-900">
                <span className="rounded-full bg-slate-950/10 px-4 py-2 text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]">
                  Leitura IA
                </span>
                <span className="rounded-full bg-slate-950/10 px-4 py-2 text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]">
                  Espaço de leitura
                </span>
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
                Avaliação de fluência leitora
              </h1>
              <p className="max-w-2xl text-lg font-medium text-slate-700">
                O aluno lê o texto em voz alta. O sistema escuta, orienta e mostra o ritmo
                com um visual suave e futurista.
              </p>
            </div>

            <div className="flex min-h-[240px] items-center justify-center rounded-[1.75rem] border border-slate-200/60 bg-slate-50/90 p-5 shadow-[0_18px_50px_-20px_rgba(14,165,233,0.18)] backdrop-blur-xl">
              <div className="relative h-44 w-44">
                <div className="absolute left-1 top-8 h-28 w-32 -rotate-6 rounded-3xl border border-white/15 bg-white/10 shadow-xl" />
                <div className="absolute right-1 top-8 h-28 w-32 rotate-6 rounded-3xl border border-white/15 bg-cyan-300/15 shadow-xl" />
                <div className="absolute left-10 top-16 h-3 w-20 rounded-full bg-cyan-200/90" />
                <div className="absolute left-12 top-24 h-3 w-16 rounded-full bg-cyan-200/80" />
                <div className="absolute bottom-4 left-8 rounded-full border border-white/20 bg-cyan-400 px-4 py-3 text-3xl font-black text-slate-950 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.55)]">
                  A+
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-[1.5rem] border border-slate-200/60 bg-slate-950/10 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.14)] backdrop-blur-xl">
            <h2 className="text-2xl font-black text-slate-950">Dados da avaliação</h2>

            <label className="mt-5 block text-sm font-bold text-slate-800">
              Nome do aluno
              <input
                id="aluno-avaliacao"
                value={aluno}
                onChange={(event) => setAluno(event.target.value)}
                placeholder="Ex.: Ana Clara"
                className="mt-2 w-full rounded-3xl border border-slate-200/70 bg-white px-4 py-3 text-slate-950 outline-none shadow-[0_15px_35px_-25px_rgba(148,163,184,0.25)] focus:border-cyan-300 focus:bg-slate-50"
              />
            </label>

            <label className="mt-5 block text-sm font-bold text-slate-800">
              Turma
              <input
                id="turma-avaliacao"
                value={turma}
                onChange={(event) => setTurma(event.target.value)}
                placeholder="Ex.: 2 ano A"
                className="mt-2 w-full rounded-3xl border border-slate-200/70 bg-white px-4 py-3 text-slate-950 outline-none shadow-[0_15px_35px_-25px_rgba(148,163,184,0.25)] focus:border-cyan-300 focus:bg-slate-50"
              />
            </label>

            <div className="mt-6 rounded-[1.75rem] border border-slate-200/60 bg-slate-950/10 p-4 text-sm font-bold text-slate-950 shadow-[0_15px_45px_-30px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              <p className="flex justify-between gap-3 border-b border-slate-700/40 pb-2">
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

          <section className="rounded-[1.75rem] border border-slate-200/60 bg-white/95 p-5 shadow-[0_20px_60px_-25px_rgba(14,165,233,0.18)] backdrop-blur-xl">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-black">Texto para leitura</h2>
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
                        Leia a palavra que aparece. Ela some e outra surge.
                      </div>
                      <div className="min-h-[5rem] flex items-center justify-center text-5xl font-black text-slate-950">
                        {wordVisible ? palavrasTextoAtual[currentWordIndex] : ""}
                      </div>
                      <div className="rounded-full bg-cyan-100 px-4 py-3 text-center text-sm font-bold text-slate-900 shadow-[0_10px_20px_-10px_rgba(14,165,233,0.25)]">
                        Tempo restante: {tempoRestante}s
                      </div>
                      {resultado?.avaliacaoFaseUm && currentPart === 0 && (
                        <div className="mt-4 rounded-lg border-2 border-slate-900 bg-white p-4 text-sm text-slate-900 shadow-[3px_3px_0_#0f172a]">
                          <p className="font-bold">Resultado da primeira fase</p>
                          <p>
                            Corretas: {resultado.avaliacaoFaseUm.corretas} de {resultado.avaliacaoFaseUm.total} palavras
                          </p>
                          <p>Precisão: {resultado.avaliacaoFaseUm.precisao}%</p>
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
                    className="rounded-full border border-cyan-300/40 bg-gradient-to-r from-cyan-400/90 to-sky-500/90 px-6 py-4 text-lg font-black text-slate-950 shadow-[0_20px_60px_-35px_rgba(14,165,233,0.95)] transition hover:-translate-y-0.5 hover:scale-[1.01] hover:from-cyan-300/95 hover:to-sky-400/95"
                  >
                    Iniciar gravação
                  </button>
                ) : (
                  <button
                    id="botao-parar-gravacao"
                    type="button"
                    onClick={acionarParada}
                    className="rounded-full border border-fuchsia-300/30 bg-gradient-to-r from-fuchsia-500/90 to-violet-500/90 px-6 py-4 text-lg font-black text-slate-950 shadow-[0_20px_60px_-35px_rgba(168,85,247,0.9)] transition hover:-translate-y-0.5 hover:scale-[1.01] hover:from-fuchsia-400/95 hover:to-violet-400/95"
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

              <p className="rounded-[1.5rem] border border-slate-200/60 bg-slate-950/10 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_15px_40px_-25px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                Status: <span id="status-gravacao">{statusGravacao}</span>
              </p>

              {audioUrl && (
                <div className="rounded-[1.5rem] border border-slate-200/60 bg-white/95 p-4 shadow-[0_15px_40px_-25px_rgba(14,165,233,0.18)] backdrop-blur-xl">
                  <p className="mb-3 text-sm font-black text-slate-900">
                    Gravação capturada
                  </p>
                  <audio controls src={audioUrl} className="w-full rounded-3xl bg-slate-100" />
                </div>
              )}

              <div
                id="audio-fallback"
                className="hidden rounded-lg border-4 border-slate-900 bg-[#f8fafc] p-4 shadow-[4px_4px_0_#0f172a]"
              />

              <div
                id="resultado-fallback"
                className="hidden rounded-lg border-4 border-slate-900 bg-[#f8fafc] p-5 shadow-[4px_4px_0_#0f172a]"
              />

              {transcricao && (
                <div className="rounded-lg border-4 border-slate-900 bg-[#ecfeff] p-4 shadow-[4px_4px_0_#0f172a]">
                  <p className="mb-2 text-sm font-black text-slate-800">
                    Transcrição capturada
                  </p>
                  <p className="text-slate-900">{transcricao}</p>
                </div>
              )}

              {resultado && (
                <div className="grid gap-4 rounded-[1.75rem] border border-slate-200/60 bg-white/95 p-5 shadow-[0_20px_60px_-25px_rgba(14,165,233,0.18)] sm:grid-cols-3 backdrop-blur-xl">
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

                  <div>
                    <p className="text-sm font-bold text-slate-500">Ritmo</p>
                    <p className="text-2xl font-semibold">
                      {resultado.palavrasPorMinuto} ppm
                    </p>
                  </div>

                  {resultado.precisao !== undefined && (
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
