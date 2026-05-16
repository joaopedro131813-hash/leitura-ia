import re
import unicodedata
from difflib import SequenceMatcher

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://saga-tarnish-coeditor.ngrok-free.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalizar_texto(valor: str):
    sem_acentos = unicodedata.normalize("NFD", valor.lower())
    sem_acentos = "".join(
        caractere
        for caractere in sem_acentos
        if unicodedata.category(caractere) != "Mn"
    )
    return re.findall(r"[a-z0-9]+", sem_acentos)


def analisar_transcricao(texto_esperado: str, transcricao: str):
    palavras_esperadas = normalizar_texto(texto_esperado)
    palavras_lidas = normalizar_texto(transcricao)

    if not palavras_esperadas or not palavras_lidas:
        return {
            "precisao": 0,
            "palavrasReconhecidas": len(palavras_lidas),
            "palavrasCorretas": 0,
        }

    comparador = SequenceMatcher(None, palavras_esperadas, palavras_lidas)
    palavras_corretas = sum(bloco.size for bloco in comparador.get_matching_blocks())
    precisao = round((palavras_corretas / len(palavras_esperadas)) * 100)

    return {
        "precisao": min(100, precisao),
        "palavrasReconhecidas": len(palavras_lidas),
        "palavrasCorretas": palavras_corretas,
    }


def classificar_fluencia(palavras_por_minuto: int, precisao: int | None):
    if precisao is not None:
        if precisao < 20:
            return {
                "nivel": "Pré-leitor",
                "cor": "text-rose-300",
                "observacao": "Poucas palavras foram reconhecidas em relação ao texto.",
            }

        if precisao < 55 or palavras_por_minuto < 35:
            return {
                "nivel": "Leitor silábico",
                "cor": "text-amber-300",
                "observacao": (
                    "A leitura parece lenta ou com muitas diferenças em relação ao texto."
                ),
            }

        if precisao < 85 or palavras_por_minuto < 75:
            return {
                "nivel": "Leitor iniciante",
                "cor": "text-sky-300",
                "observacao": (
                    "A leitura está em desenvolvimento, com parte significativa do texto reconhecida."
                ),
            }

        return {
            "nivel": "Leitor fluente",
            "cor": "text-emerald-300",
            "observacao": "Boa velocidade e boa correspondência com o texto esperado.",
        }

    if palavras_por_minuto < 15:
        return {
            "nivel": "Pré-leitor",
            "cor": "text-rose-300",
            "observacao": "Leitura muito inicial ou com pouca produção oral registrada.",
        }

    if palavras_por_minuto < 35:
        return {
            "nivel": "Leitor silábico",
            "cor": "text-amber-300",
            "observacao": (
                "Leitura lenta, possivelmente marcada por pausas e decodificação sílaba por sílaba."
            ),
        }

    if palavras_por_minuto < 75:
        return {
            "nivel": "Leitor iniciante",
            "cor": "text-sky-300",
            "observacao": (
                "Leitura em desenvolvimento, com ritmo suficiente para acompanhar textos simples."
            ),
        }

    return {
        "nivel": "Leitor fluente",
        "cor": "text-emerald-300",
        "observacao": (
            "Leitura com bom ritmo. A precisão deve ser confirmada pela comparação com o texto."
        ),
    }


@app.get("/")
def home():
    return {"mensagem": "Backend funcionando"}


@app.post("/upload")
async def upload_audio(
    audio: UploadFile = File(...),
    aluno: str = Form(""),
    turma: str = Form(""),
    texto: str = Form(""),
    tempo: float = Form(0),
    transcricao: str = Form(""),
):
    conteudo_audio = await audio.read()
    quantidade_palavras = len(texto.strip().split()) if texto.strip() else 0
    palavras_por_minuto = (
        round((quantidade_palavras / tempo) * 60) if tempo > 0 else 0
    )

    analise = analisar_transcricao(texto, transcricao) if transcricao.strip() else None
    precisao = analise["precisao"] if analise else None
    classificacao = classificar_fluencia(palavras_por_minuto, precisao)

    return {
        **classificacao,
        "aluno": aluno,
        "turma": turma,
        "tempo": tempo,
        "palavras": quantidade_palavras,
        "palavrasPorMinuto": palavras_por_minuto,
        "precisao": precisao,
        "palavrasReconhecidas": analise["palavrasReconhecidas"] if analise else 0,
        "palavrasCorretas": analise["palavrasCorretas"] if analise else 0,
        "arquivoRecebido": audio.filename,
        "tamanhoAudioBytes": len(conteudo_audio),
        "transcricao": transcricao or "Transcrição automática não capturada.",
        "origem": (
            "Classificação feita pelo backend usando tempo de leitura e comparação "
            "entre transcrição reconhecida e texto esperado."
        ),
    }
