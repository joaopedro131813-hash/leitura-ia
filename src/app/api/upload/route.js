import { NextResponse } from "next/server";

function normalizarTexto(valor) {
  const semAcentos = valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return semAcentos
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function analisarTranscricao(textoEsperado, transcricao) {
  const palavrasEsperadas = normalizarTexto(textoEsperado);
  const palavrasLidas = normalizarTexto(transcricao);

  if (!palavrasEsperadas.length || !palavrasLidas.length) {
    return {
      precisao: 0,
      palavrasReconhecidas: palavrasLidas.length,
      palavrasCorretas: 0,
    };
  }

  let corretas = 0;
  let indexLido = 0;

  for (const palavra of palavrasEsperadas) {
    while (indexLido < palavrasLidas.length && palavrasLidas[indexLido] !== palavra) {
      indexLido += 1;
    }
    if (indexLido < palavrasLidas.length && palavrasLidas[indexLido] === palavra) {
      corretas += 1;
      indexLido += 1;
    }
  }

  const precisao = Math.round((corretas / palavrasEsperadas.length) * 100);

  return {
    precisao: Math.min(100, precisao),
    palavrasReconhecidas: palavrasLidas.length,
    palavrasCorretas: corretas,
  };
}

function classificarFluencia(palavrasPorMinuto, precisao) {
  if (precisao !== undefined && precisao !== null) {
    if (precisao < 20) {
      return {
        nivel: "Pré-leitor",
        cor: "text-rose-300",
        observacao: "Poucas palavras foram reconhecidas em relação ao texto.",
      };
    }
    if (precisao < 55 || palavrasPorMinuto < 35) {
      return {
        nivel: "Leitor silábico",
        cor: "text-amber-300",
        observacao:
          "A leitura parece lenta ou com muitas diferenças em relação ao texto.",
      };
    }
    if (precisao < 85 || palavrasPorMinuto < 75) {
      return {
        nivel: "Leitor iniciante",
        cor: "text-sky-300",
        observacao:
          "A leitura está em desenvolvimento, com parte significativa do texto reconhecida.",
      };
    }

    return {
      nivel: "Leitor fluente",
      cor: "text-emerald-300",
      observacao: "Boa velocidade e boa correspondência com o texto esperado.",
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

export async function POST(request) {
  try {
    const formData = await request.formData();
    const texto = String(formData.get("texto") ?? "");
    const transcricao = String(formData.get("transcricao") ?? "");
    const aluno = String(formData.get("aluno") ?? "");
    const turma = String(formData.get("turma") ?? "");
    const tempo = Number(formData.get("tempo") ?? 0);
    const audio = formData.get("audio");

    const quantidadePalavras = texto.trim().split(/\s+/).filter(Boolean).length;
    const palavrasPorMinuto = tempo > 0 ? Math.round((quantidadePalavras / tempo) * 60) : 0;

    const analise = transcricao.trim()
      ? analisarTranscricao(texto, transcricao)
      : null;
    const precisao = analise?.precisao;
    const classificacao = classificarFluencia(palavrasPorMinuto, precisao);

    const arquivoRecebido = audio?.name ?? "não informado";
    const tamanhoAudioBytes = audio?.size ?? 0;

    return NextResponse.json(
      {
        ...classificacao,
        aluno,
        turma,
        tempo,
        palavras: quantidadePalavras,
        palavrasPorMinuto,
        precisao,
        palavrasReconhecidas: analise?.palavrasReconhecidas ?? 0,
        palavrasCorretas: analise?.palavrasCorretas ?? 0,
        arquivoRecebido,
        tamanhoAudioBytes,
        transcricao: transcricao || "Transcrição automática não capturada.",
        origem:
          "Classificação feita pelo backend Next.js usando tempo de leitura e comparação entre transcrição reconhecida e texto esperado.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Erro interno no upload:", error);
    return NextResponse.json(
      { error: `Erro interno no upload: ${error?.message || error}` },
      { status: 500 },
    );
  }
}
