"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarPin } from "./acoes";

export default function PedirPin({ token, nome }: { token: string; nome: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [errou, setErrou] = useState(false);
  const [pendente, iniciar] = useTransition();

  const tentar = (valor: string) => {
    setErrou(false);
    iniciar(async () => {
      const passou = await guardarPin(token, valor);
      if (passou) router.refresh();
      else {
        setErrou(true);
        setPin("");
      }
    });
  };

  const digitar = (d: string) => {
    if (pendente) return;
    const novo = (pin + d).slice(0, 4);
    setPin(novo);
    if (novo.length === 4) tentar(novo);
  };

  return (
    <main className="chao chao-pin">
      <h1>Olá, {nome}</h1>
      <p className="chao-sub">Digite os 4 números do seu acesso.</p>

      <div className="pin-bolinhas" aria-label={`${pin.length} de 4 dígitos`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-bolinha ${i < pin.length ? "cheia" : ""}`} />
        ))}
      </div>

      {errou && (
        <p className="alerta" role="alert">
          Não confere. Tente de novo.
        </p>
      )}

      <div className="pin-teclado">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="pin-tecla" onClick={() => digitar(d)} disabled={pendente}>
            {d}
          </button>
        ))}
        <span />
        <button className="pin-tecla" onClick={() => digitar("0")} disabled={pendente}>
          0
        </button>
        <button
          className="pin-tecla apagar"
          onClick={() => setPin(pin.slice(0, -1))}
          disabled={pendente}
          aria-label="Apagar"
        >
          ←
        </button>
      </div>

      <p className="chao-rodape">
        Pergunto uma vez só neste celular.
      </p>
    </main>
  );
}
