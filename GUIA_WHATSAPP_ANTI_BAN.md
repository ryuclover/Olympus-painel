# Estratégia de Disparo WhatsApp Anti-Banimento (Meta 2026) e Guia do Sistema

Este documento descreve as políticas oficiais do WhatsApp/Meta, os principais gatilhos de banimento e a arquitetura de **Fila Inteligente com Spintax** implementada no painel Olympus.

---

## 1. Como Funciona a Política de Bloqueios do WhatsApp (Meta 2026)

O algoritmo de segurança do WhatsApp monitora o comportamento da conta através de **sinais de reputação**:

1. **Taxa de Bloqueio e Denúncia (O Gatilho Nº 1 de Banimento):**
   * Se mais de **2%** das pessoas que receberem sua mensagem clicarem em *"Bloquear"* ou *"Denunciar como Spam"*, a conta entra em análise imediata e pode ser banida em minutos.
   * Por isso, a abordagem **nunca** deve parecer um spam agressivo com links desconhecidos logo na primeira frase.

2. **Detecção de Automação por Padrão Repetitivo (Hash de Mensagem):**
   * O WhatsApp identifica quando dezenas de mensagens com **exatamente o mesmo texto** saem do mesmo número para contatos que não têm o seu número salvo na agenda.
   * O envio em rajada (ex: 20 mensagens em 5 segundos) é um sinal claro de robô.

3. **Novo Número vs Número Aquecido (Warm-up):**
   * Chips novos (comprados recentemente) têm tolerância muito baixa. Devem começar enviando 10 a 15 mensagens por dia na primeira semana e aumentar gradualmente.

---

## 2. A Estratégia Implementada no Olympus

Para permitir o contato com dezenas de clientes com **risco zero de bloqueio**, implementamos uma arquitetura em 4 camadas:

### A. Tecnologia Spintax (Mensagens Nunca Idênticas)
O sistema aceita chaves `{opção1|opção2|opção3}` que geram variações automáticas a cada envio:
* **Exemplo de Template:**
  > `{Olá|Oi|Tudo bem}, {primeiro_nome}! Vi seu negócio no Google Maps e reparei que seu perfil pode receber muito mais clientes pelo WhatsApp. Podemos conversar rapidinho?`
* Cada contato recebe uma saudação e estrutura de frase diferente, impedindo que o algoritmo detecte um padrão de spam idêntico.

### B. Fila Inteligente com Intervalo Humano (Jitter)
* Em vez de disparar tudo no mesmo segundo, o sistema cria uma fila no banco de dados SQLite (`fila_whatsapp`).
* O usuário define um intervalo seguro (padrão: **25 a 50 segundos** entre cada contato).
* O tempo entre mensagens é **aleatório**, simulando exatamente o comportamento de um atendente humano digitando e enviando.

### C. Disparo Assistido Seguro
* Ao clicar em **"Iniciar Disparo Seguro"**, o sistema abre a conversa diretamente via WhatsApp Web oficial (`wa.me`), pré-preenchendo a mensagem personalizada.
* Marca o lead como `contatado` no CRM automaticamente.
* Permite pausar, limpar mensagens concluídas ou disparar contatos específicos com 1 clique.

---

## 3. Guia Rápido de Uso no Painel

1. **Buscar Leads:**
   * Faça sua pesquisa de bairro/cidade no Olympus (com a opção **"Apenas WhatsApp"** ligada).
2. **Selecionar Leads:**
   * Marque as caixas de seleção dos clientes que deseja contatar.
3. **Clicar em "Envio Automático":**
   * O botão no topo da lista abrirá o **Modal de Disparo Inteligente**.
4. **Configurar e Iniciar:**
   * Revise o template com Spintax e as variáveis `{primeiro_nome}`, `{cidade}`, `{categoria}`.
   * Clique em **"Adicionar à Fila Segura"** e depois em **"Iniciar Disparo Seguro"**.
