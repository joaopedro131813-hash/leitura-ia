(function () {
  const BACKEND_URL = window.location.origin;
  const UPLOAD_URL = `${BACKEND_URL}/api/upload`;

  let mediaRecorder = null;
  let streamAtual = null;
  let inicioLeitura = null;
  let audioChunks = [];
  let ultimoPointerDown = 0;

  function buscar(id) {
    return document.getElementById(id);
  }

  function texto(id) {
    return buscar(id)?.value || "";
  }

  function atualizarStatus(mensagem) {
    const status = buscar("status-gravacao");
    if (status) {
      status.textContent = mensagem;
    }
  }

  function mostrarAudio(blob) {
    const area = buscar("audio-fallback");
    if (!area) {
      return;
    }

    const audioUrl = URL.createObjectURL(blob);
    area.classList.remove("hidden");
    area.innerHTML = [
      '<p class="mb-3 text-sm font-black text-slate-800">Gravação capturada</p>',
      '<audio controls class="w-full" src="' + audioUrl + '"></audio>',
    ].join("");
  }

  function mostrarResultado(resultado) {
    const area = buscar("resultado-fallback");
    if (!area) {
      return;
    }

    area.classList.remove("hidden");
    area.innerHTML = [
      '<p class="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Classificação</p>',
      '<p class="mt-2 text-3xl font-bold ' + resultado.cor + '">' + resultado.nivel + "</p>",
      '<p class="mt-2 font-medium text-slate-700">' + resultado.observacao + "</p>",
      '<div class="mt-4 grid gap-4 sm:grid-cols-4">',
      '<div><p class="text-sm font-bold text-slate-500">Tempo</p><p class="text-2xl font-semibold">' + resultado.tempo + "s</p></div>",
      '<div><p class="text-sm font-bold text-slate-500">Palavras</p><p class="text-2xl font-semibold">' + resultado.palavras + "</p></div>",
      '<div><p class="text-sm font-bold text-slate-500">Ritmo</p><p class="text-2xl font-semibold">' + resultado.palavrasPorMinuto + " ppm</p></div>",
      '<div><p class="text-sm font-bold text-slate-500">Precisão</p><p class="text-2xl font-semibold">' + (resultado.precisao ?? "-") + "%</p></div>",
      "</div>",
      '<p class="mt-4 text-sm font-medium text-slate-500">' + resultado.origem + "</p>",
    ].join("");
  }

  async function enviarAudio(audioBlob, duracao) {
    const textoAvaliacao = texto("texto-avaliacao-fixo");
    const formData = new FormData();
    formData.append("audio", audioBlob, "leitura.webm");
    formData.append("aluno", texto("aluno-avaliacao"));
    formData.append("turma", texto("turma-avaliacao"));
    formData.append("texto", textoAvaliacao);
    formData.append("tempo", String(duracao));
    formData.append("transcricao", "");

    const resposta = await fetch(UPLOAD_URL, {
      method: "POST",
      body: formData,
    });

    if (!resposta.ok) {
      const erroTexto = await resposta.text().catch(() => resposta.statusText);
      throw new Error(`Upload falhou (${resposta.status}: ${erroTexto})`);
    }

    return resposta.json();
  }

  async function iniciarGravacao(event) {
    event.preventDefault();
    event.stopPropagation();

    if (mediaRecorder && mediaRecorder.state === "recording") {
      return;
    }

    atualizarStatus("Botão acionado. Pedindo permissão do microfone...");

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        atualizarStatus("Este navegador não permite captura de áudio nesta página.");
        return;
      }

      if (!window.MediaRecorder) {
        atualizarStatus("Este navegador não oferece suporte para gravação de áudio.");
        return;
      }

      streamAtual = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(streamAtual);

      mediaRecorder.ondataavailable = function (audioEvent) {
        if (audioEvent.data.size > 0) {
          audioChunks.push(audioEvent.data);
        }
      };

      mediaRecorder.onstop = async function () {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const duracao = Number(((Date.now() - inicioLeitura) / 1000).toFixed(2));
        mostrarAudio(audioBlob);
        atualizarStatus("Gravação finalizada. Processando resultado...");

        try {
          const resultado = await enviarAudio(audioBlob, duracao);
          mostrarResultado(resultado);
          atualizarStatus("Avaliação concluída.");
        } catch (erro) {
          console.error("Erro ao enviar áudio para backend:", erro);
          atualizarStatus(
            "Áudio gravado, mas o backend não respondeu. " + (erro.message || ""),
          );
        }
      };

      inicioLeitura = Date.now();
      mediaRecorder.start();
      const botaoIniciar = buscar("botao-iniciar-gravacao");
      if (botaoIniciar) {
        botaoIniciar.textContent = "Parar gravação";
        botaoIniciar.classList.remove("bg-cyan-300", "hover:bg-cyan-200");
        botaoIniciar.classList.add("bg-rose-400", "hover:bg-rose-300");
      }
      atualizarStatus("Gravando. Leia o texto em voz alta.");
    } catch (erro) {
      atualizarStatus("Microfone não liberado: " + (erro.message || "verifique a permissão."));
    }
  }

  function pararGravacao(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!mediaRecorder || mediaRecorder.state !== "recording") {
      atualizarStatus("Nenhuma gravação em andamento.");
      return;
    }

    mediaRecorder.stop();
    const botaoIniciar = buscar("botao-iniciar-gravacao");
    if (botaoIniciar) {
      botaoIniciar.textContent = "Iniciar gravação";
      botaoIniciar.classList.remove("bg-rose-400", "hover:bg-rose-300");
      botaoIniciar.classList.add("bg-cyan-300", "hover:bg-cyan-200");
    }
    streamAtual?.getTracks().forEach(function (track) {
      track.stop();
    });
  }

  function alternarGravacao(event) {
    if (event.type === "pointerdown") {
      ultimoPointerDown = Date.now();
    }

    if (event.type === "click" && Date.now() - ultimoPointerDown < 600) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (mediaRecorder && mediaRecorder.state === "recording") {
      pararGravacao(event);
      return;
    }

    iniciarGravacao(event);
  }

  function conectarBotoes() {
    const botaoIniciar = buscar("botao-iniciar-gravacao");
    const botaoParar = buscar("botao-parar-gravacao");

    if (botaoIniciar) {
      botaoIniciar.addEventListener("click", alternarGravacao, true);
      botaoIniciar.addEventListener("pointerdown", alternarGravacao, true);
    }

    if (botaoParar) {
      botaoParar.addEventListener("click", pararGravacao, true);
      botaoParar.addEventListener("pointerdown", pararGravacao, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", conectarBotoes);
  } else {
    conectarBotoes();
  }
})();
