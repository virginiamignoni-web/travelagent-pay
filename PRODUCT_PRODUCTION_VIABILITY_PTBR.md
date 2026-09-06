# BIT Travels — Viabilidade de mercado e caminho para produção

**Data:** 5 de agosto de 2026  
**Destinatária:** Vhendala  
**Status atual:** protótipo funcional submetido ao Stellar Summit SP 2026

## 1. Resumo executivo

A BIT Travels construiu um protótipo que combina planejamento de viagem, monitoramento operacional, assistência ao passageiro, vouchers auditáveis em Stellar e pagamento por Pix por meio de um fluxo de off-ramp em sandbox.

O produto é tecnicamente viável e possui uma oportunidade comercial clara, principalmente como plataforma B2B para companhias aéreas, seguradoras, aeroportos e operadores de assistência. O caminho mais seguro não é a BIT Travels tornar-se banco, custodiante, emissora de stablecoin ou participante direta do Pix. A BIT deve atuar como plataforma de software e orquestração, utilizando parceiros regulados para custódia, ativos virtuais, conversão e liquidação financeira.

Avaliação geral:

- **Viabilidade técnica:** alta.
- **Viabilidade comercial B2B:** alta, condicionada à obtenção de um piloto.
- **Viabilidade regulatória:** média/alta com parceiros autorizados; baixa se a BIT custodiar ou converter valores diretamente.
- **Viabilidade B2C como agência completa:** média, devido à complexidade de emissão, atendimento, reembolso e capital de giro.
- **Melhor produto inicial:** automação da assistência, vouchers, Pix, conciliação e auditoria.

## 2. Links oficiais do projeto e das submissões

### Projeto

- **Repositório:** [github.com/virginiamignoni-web/travelagent-pay](https://github.com/virginiamignoni-web/travelagent-pay)
- **Aplicação pública:** [bit-travels-concierge.onrender.com](https://bit-travels-concierge.onrender.com)

### Bounties

- **Agentic Payments (x402 / MPP):** [GrantFox — inscrição](https://bounties.grantfox.xyz/events/stellar-summit-sp-2026/bounties/1ea01384-3a40-4b3d-a26b-90a0a7ebe3d8)
- **Brazil Ramps and Regional Kits:** [GrantFox — inscrição](https://bounties.grantfox.xyz/events/stellar-summit-sp-2026/bounties/b01580a0-7267-4ee4-a532-f70ff3ec8e6d)

### Evidências Stellar Testnet

- **Pagamento do serviço do agente — 0,01 USDC:** [transação bbcafe…19a2](https://stellar.expert/explorer/testnet/tx/bbcafe74b523e7c241c94eb680846ce63a3092cb7440fd0f0127f7d5a5c519a2)
- **Prova de pagamento da reserva — 0,10 USDC:** [transação 9a76ba…5317](https://stellar.expert/explorer/testnet/tx/9a76ba7e3805074f7ea428ebb538808063dd8f3fb213847a32a675691d055317)
- **Financiamento do voucher — 1,00 USDC:** [transação f59dca…fcb86](https://stellar.expert/explorer/testnet/tx/f59dcae4eec7c9c58361f09f0f16e41b2ab5f350ebfa5e2e711c05fb945fcb86)
- **Prova do fluxo de off-ramp/anchor — 1,00 USDC, status `funded`:** [transação 950528…aec6e](https://stellar.expert/explorer/testnet/tx/950528b23b743e776616c6bbf3161493f256d60acb4632a688bd29d10a0aec6e)

> As operações atuais usam Stellar Testnet, Duffel Test Mode e Etherfuse Sandbox. Elas comprovam a integração técnica e o ciclo operacional, mas não representam liquidação bancária real, emissão aérea comercial ou pagamento real de uma companhia aérea.

## 3. Produtos que podem surgir da plataforma

### 3.1 BIT Travels Concierge

Produto para o viajante:

- Planejamento orientado a eventos e compromissos.
- Pesquisa e comparação de voos.
- Hospedagem próxima ao local principal.
- Mobilidade e transporte.
- Orçamento completo em USDC.
- Avaliação de risco operacional.
- Reserva e pagamento.
- Área “Minhas viagens”.
- Monitoramento de viagem ativa.

### 3.2 BIT Journey Protection

Produto B2B independente:

- Monitoramento de voos.
- Detecção de atrasos, cancelamentos e outros eventos.
- Aplicação das políticas da companhia e das regras da ANAC.
- Autorização automática ou humana.
- Emissão de assistência para alimentação, transporte e acomodação.
- Financiamento e entrega do benefício.
- Utilização por Pix.
- Conciliação financeira.
- Registro auditável.
- Painel operacional, financeiro e regulatório.

O BIT Journey Protection é o ativo comercial mais forte porque pode ser vendido sem que a BIT seja responsável por vender toda a viagem.

## 4. Proposta central de valor

> A BIT Travels reduz o tempo entre a ocorrência do problema, o reconhecimento do direito e a assistência efetivamente recebida pelo passageiro.

O ciclo completo é:

```text
Evento confirmado
→ regra aplicável identificada
→ autorização da companhia ou seguradora
→ benefício financiado
→ passageiro notificado
→ voucher utilizado
→ pagamento conciliado
→ prova auditável preservada
```

Para o passageiro, a tecnologia deve ser invisível: ele vê o valor disponível e a opção de pagar com Pix. Stellar, USDC e o provedor de off-ramp funcionam nos bastidores.

## 5. O que falta para o produto operar no mundo real

### 5.1 Definição de responsabilidades

Os contratos devem determinar:

- Quem reconhece o direito do passageiro.
- Quem financia o benefício.
- Quem autoriza a emissão automática.
- Quem atende contestações.
- Quem responde por fraude ou pagamento duplicado.
- Quem é controlador, operador e suboperador de dados.
- Quem executa KYC, KYB e controles financeiros.
- Quem assume tarifas, câmbio, estornos e perdas.

A BIT não deve declarar unilateralmente que uma companhia violou uma norma. O produto deve calcular elegibilidade, consultar a política contratada e solicitar autorização automática ou operacional.

### 5.2 Motor regulatório da ANAC

A regra básica atualmente considerada é:

- Uma hora: comunicação.
- Duas horas: alimentação.
- Quatro horas: acomodação, quando houver pernoite, e transporte de ida e volta.

A assistência material é devida ao passageiro que está no aeroporto e independe da causa do atraso. A referência oficial está na página da [ANAC sobre alteração, atraso e cancelamento](https://www.gov.br/anac/en/topics/passengers/flight-change-delay-and-cancellation).

O motor ainda deve tratar:

- Cancelamento, interrupção e preterição de embarque.
- Reacomodação, reembolso e transporte alternativo.
- Passageiro residente na localidade.
- Passageiros com necessidades especiais.
- Conexões e trechos operados por empresas diferentes.
- Assistência já oferecida fisicamente.
- Recusa ou escolha do passageiro.
- Voos internacionais sujeitos às regras brasileiras.
- Políticas superiores oferecidas pela companhia.
- Mudanças futuras da regulamentação.

Cada decisão deve guardar a versão da regra aplicada, a fonte do evento e a identidade da organização que autorizou o benefício. Antes da produção, será necessário parecer jurídico especializado em direito aeronáutico.

### 5.3 Fonte operacional de voo

O plano gratuito do Aviationstack não é suficiente como fonte exclusiva. A produção precisa de uma ou mais opções:

- Integração direta com a companhia aérea.
- Sistema operacional ou DCS da companhia.
- Feed do aeroporto.
- Provedor comercial como Cirium, FlightAware ou OAG.
- Duffel para mudanças de ordens emitidas por ele.
- Dupla confirmação entre fontes.
- Console humano para exceções.

O sistema deve distinguir atraso previsto, atraso confirmado, horário estimado, cancelamento, conexão perdida e presença do passageiro. Uma API pública isolada não deve liberar dinheiro automaticamente.

### 5.4 Identidade e elegibilidade do passageiro

Será necessário validar:

- PNR e número do bilhete.
- Nome, documento e contato.
- Trecho afetado.
- Status de check-in e presença, quando aplicável.
- Companhia emissora e operadora.
- Benefícios já recebidos.
- Carteira ou conta Pix do beneficiário.

O sistema deve impedir que uma pessoa apenas informe um voo atrasado e receba um voucher sem vínculo com a reserva.

### 5.5 Emissão aérea em produção

A integração Duffel atual está em modo de teste. Para produção serão necessários:

- Aprovação comercial da conta.
- Crédito ou saldo operacional.
- Definição de quem cobra o passageiro.
- Webhooks e idempotência.
- Políticas de alteração, cancelamento e reembolso.
- Confirmações e comunicação pós-venda.
- Atendimento ao passageiro.
- Conciliação de cada ordem.

A Duffel informa que a agência deve cobrar o cliente antes de criar a ordem e que o pagamento ao fornecedor pode utilizar um saldo pré-financiado. ARC/BSP depende de acreditação e configuração com as companhias. Ver [Getting Started with Flights](https://duffel.com/docs/guides/getting-started-with-flights) e [Choosing a Payment Method](https://duffel.com/docs/guides/choosing-a-payment-method).

As integrações de reserva podem demorar e movimentam dinheiro, exigindo timeout adequado, retentativas seguras e consulta posterior para evitar cobrança ou emissão duplicada. Ver [Response Handling](https://duffel.com/docs/api/overview/response-handling).

### 5.6 Hotéis e mobilidade

As opções atuais são demonstrativas. A produção exige:

- API de hospedagem com disponibilidade e tarifa.
- Contrato com fornecedor ou agregador.
- Referência externa real.
- Regras de cancelamento, no-show, impostos e taxas.
- API de traslado, mobilidade ou locadora.
- Disponibilidade após alteração de voo.
- Consentimento quando houver diferença de preço.
- Responsabilidade contratual por perda ou alteração de reserva.

### 5.7 Arquitetura financeira e regulatória

A BIT deve evitar:

- Custodiar recursos dos passageiros.
- Comprar ou vender ativos virtuais por conta própria.
- Operar Pix diretamente.
- Manter saldos de terceiros sem parceiro autorizado.
- Converter USDC e BRL internamente.

Desde fevereiro de 2026, a Resolução BCB nº 520 disciplina as prestadoras de serviços de ativos virtuais. A regulamentação inclui autorização, governança, segurança, controles internos, prevenção à lavagem de dinheiro e transparência. Fontes: [comunicado do Banco Central](https://www.bcb.gov.br/detalhenoticia/20918/nota?s=08) e [Resolução BCB nº 520](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=520&tipo=Resolu%C3%A7%C3%A3o+BCB).

Arquitetura recomendada:

```text
Companhia aérea ou seguradora
→ parceiro financeiro/cripto regulado
→ saldo segregado ou USDC
→ benefício atribuído ao passageiro
→ parceiro de off-ramp
→ participante Pix
→ recebedor elegível
```

A BIT orquestra, aplica regras e registra; os parceiros autorizados movimentam o dinheiro.

### 5.8 Pix real e off-ramp

Para sair do sandbox serão necessários:

- Provedor que opere comercialmente o corredor USDC–BRL.
- Contrato, KYB e aprovação de produção.
- KYC quando exigido.
- Validação de carteira, conta e chave Pix.
- Cotação, prazo e tarifas transparentes.
- Limites mínimos e máximos.
- Monitoramento AML e sanções.
- Webhooks assinados.
- Status definitivo de liquidação.
- Tratamento de falhas e devoluções.
- Conciliação Stellar–provedor–Pix.
- Suporte operacional.

A BIT não deve apresentar-se como participante Pix. O Pix é operado por instituições financeiras e instituições de pagamento participantes direta ou indiretamente. Ver [Banco Central — participantes do Pix](https://www.bcb.gov.br/estabilidadefinanceira/participantespix).

Também será necessário confirmar se a Etherfuse oferece em produção o corredor, a jurisdição e o modelo comercial exatos de que a BIT precisa. O sandbox comprova a integração técnica, mas não garante liquidação bancária brasileira em produção.

### 5.9 Modelo do voucher

Existem três opções:

1. **Crédito interno em BRL:** mais simples para um piloto.
2. **USDC transferido ao passageiro:** portátil e auditável, mas exige wallet, recuperação e off-ramp.
3. **USDC nos bastidores:** parceiro regulado mantém ou converte o valor e o passageiro vê apenas reais e Pix.

A recomendação inicial é usar USDC nos bastidores, mantendo Stellar como trilho de prova e conciliação.

### 5.10 Wallet para público geral

Freighter é adequado para desenvolvimento e demonstração, mas não para passageiros comuns. Faltam:

- Wallet embutida ou smart wallet.
- Passkey e biometria.
- Recuperação de acesso.
- Patrocínio de taxas.
- Trustline automática.
- Limite de gasto e destinos permitidos.
- Bloqueio por categoria e validade.
- Proteção contra endereços incorretos.
- Atendimento em caso de perda do aparelho.

O usuário não deve precisar conhecer seed phrase, trustline, memo ou Stellar.

### 5.11 Segurança financeira

Antes de movimentar valor real:

- Gestão de chaves com KMS/HSM.
- Separação entre tesouraria e carteiras operacionais.
- Multisig e limites.
- Allow-list de destinos.
- Idempotency keys.
- Proteção contra replay.
- Assinatura e validação de webhooks.
- Rate limiting.
- Rotação de segredos.
- Auditoria externa e pentest.
- Monitoramento contínuo.
- Kill switch.
- Recuperação de desastre.

### 5.12 Limites da prova por hash

Uma transação Stellar prova horário, valor, ativo, origem, destino e memo. Entretanto, o hash sozinho não prova que:

- O passageiro era elegível.
- A companhia autorizou a emissão.
- A notificação foi recebida.
- A assistência foi realmente utilizada.
- Os dados estavam corretos antes de serem ancorados.

A cadeia probatória deve incluir assinatura do emissor, fonte operacional, regra aplicada, comprovante de notificação, recibo de utilização, conciliação e política de retenção.

### 5.13 LGPD

O sistema tratará nome, documento, contato, localização, PNR, viagem e informações financeiras. Será necessário:

- Definir controlador, operador e suboperadores.
- Definir base legal para cada finalidade.
- Aviso de privacidade.
- Relatório de impacto.
- Minimização, retenção e descarte.
- Atendimento aos direitos do titular.
- Criptografia em trânsito e repouso.
- Transferência internacional de dados.
- Plano de resposta a incidentes.
- Não gravar nome, documento ou PNR em blockchain pública.

A função efetivamente exercida determina quem é controlador ou operador; a nomenclatura contratual, isoladamente, não resolve. Ver [Guia de agentes de tratamento da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/nova-versao-do-guia-dos-agentes-de-tratamento).

### 5.14 Infraestrutura de produção

O Render e o SQLite atuais atendem à demonstração. Produção exige:

- PostgreSQL gerenciado.
- Ambientes separados.
- Backups e restauração testados.
- Alta disponibilidade.
- Filas e jobs persistentes.
- Webhooks duráveis.
- Reconciliação automática.
- Observabilidade e alertas.
- Logs sem dados sensíveis.
- SLA e suporte.
- WAF/CDN e domínio próprio.
- Migrações controladas.
- CI/CD com aprovação.
- Gestão de segredos.
- Testes de carga e continuidade.

### 5.15 Operação humana

O produto precisa de um console operacional para:

- Aprovar exceções.
- Suspender ou reemitir vouchers.
- Resolver PNR incorreto e duplicidade.
- Corrigir pagamentos falhos.
- Verificar identidade.
- Atender companhia e passageiro.
- Conciliar Pix e Stellar.
- Registrar decisões humanas.
- Escalar incidentes.
- Gerar relatórios.

### 5.16 Contratos, seguros e contabilidade

Serão necessários:

- Termos de uso e política de privacidade.
- Contrato com companhias e seguradoras.
- SLA e limites de responsabilidade.
- Política de estorno.
- Contratos com fornecedores e processadores.
- DPA/LGPD.
- Seguro cibernético.
- Seguro de responsabilidade profissional.
- Parecer regulatório financeiro e aeronáutico.
- Tratamento contábil e tributário.

## 6. Viabilidade de mercado

O Brasil movimenta milhões de passageiros mensalmente. Em abril de 2025, a movimentação chegou a aproximadamente 10 milhões de passageiros, segundo a [ANAC](https://www.gov.br/anac/pt-br/noticias/newsletter/AnacInformaEdiodemaiode2025.pdf).

O problema é concreto:

- Assistência manual é lenta.
- Passageiros desconhecem seus direitos.
- Companhias operam sistemas fragmentados.
- Vouchers fechados possuem aceitação limitada.
- Reembolsos exigem documentação e atendimento.
- Falta uma prova única do evento, decisão, emissão, entrega e utilização.

Possíveis ganhos para o cliente B2B:

- Menor tempo de atendimento.
- Menor intervenção manual.
- Redução de reembolsos documentais.
- Conciliação mais simples.
- Melhoria da experiência do passageiro.
- Evidência para resolução de conflitos.
- Visibilidade operacional em tempo real.

### Clientes prioritários

1. Seguradoras e empresas de assistência de viagem.
2. Companhias aéreas regionais ou médias.
3. Operadores de ground handling.
4. Aeroportos.
5. Grandes companhias aéreas.
6. OTAs e agências corporativas.
7. ANAC como interlocutora, apoiadora ou observadora institucional.

Uma seguradora, companhia regional ou operador de assistência tende a oferecer um primeiro piloto mais rápido do que uma grande companhia aérea.

### Receita recomendada

- Taxa de implantação e integração.
- Mensalidade da plataforma.
- Tarifa por passageiro monitorado.
- Tarifa por evento de assistência.
- Tarifa por voucher liquidado.
- Módulo de auditoria e relatórios.
- Licenciamento white-label.

A BIT deve evitar depender exclusivamente de spread cambial ou percentual sobre recursos dos passageiros.

## 7. Principais riscos comerciais

- Preferência das companhias por sistemas internos.
- APIs operacionais caras ou restritas.
- Indisponibilidade comercial do corredor de off-ramp.
- Custo de KYC desproporcional a vouchers pequenos.
- Pagamento Pix irrestrito enfraquecendo o controle de categoria.
- Integração lenta com restaurantes, hotéis e transportadores.
- Pagamento indevido por decisão automática incorreta.
- Interpretação equivocada do USDC como investimento.
- Processo de compras longo nas companhias aéreas.
- Resistência se blockchain for apresentada como objetivo, e não infraestrutura.

O produto deve ser vendido como assistência imediata, controlada e auditável. Stellar deve ser a infraestrutura invisível.

## 8. Plano recomendado

### Fase 1 — 4 a 6 semanas

- Fechar o escopo do BIT Journey Protection.
- Obter parecer jurídico inicial.
- Mapear responsabilidades.
- Preparar wallet simplificada.
- Criar ambiente de homologação.
- Reforçar idempotência, segurança e reconciliação.
- Criar painel da companhia.
- Produzir pitch institucional e nota técnica.

### Fase 2 — 2 a 3 meses

- Contratar fornecedor de dados de voo.
- Firmar parceria com provedor regulado de pagamentos/off-ramp.
- Concluir KYB.
- Integrar Pix em homologação.
- Criar motor de regras versionado.
- Executar pentest.
- Fechar piloto.

### Fase 3 — 3 a 6 meses

Piloto controlado:

- Um aeroporto.
- Uma companhia, seguradora ou operador.
- Apenas alimentação inicialmente.
- Limites baixos.
- Autorização humana antes da emissão.
- Passageiros convidados.
- Medição de tempo, custo, falhas e satisfação.

### Fase 4 — 6 a 12 meses

- Automação gradual.
- Inclusão de transporte e acomodação.
- Integração operacional direta.
- Expansão para outros aeroportos.
- Auditoria externa.
- Apresentação formal à ANAC com resultados do piloto.

## 9. Veredito

O produto é comercializável e possui um caso de uso mais forte do que simplesmente “reservar viagens com cripto”. Seu diferencial é transformar assistência ao passageiro em um processo rápido, controlado, conciliável e verificável.

O caminho recomendado é:

- BIT como plataforma de software e orquestração.
- Companhia ou seguradora como responsável pelo benefício.
- Parceiro autorizado como custodiante, ramp e participante do fluxo Pix.
- Stellar como trilho verificável.
- Passageiro vendo apenas valor em reais, benefício e Pix.

O protótipo já é suficiente para iniciar conversas institucionais e buscar um piloto. Ele ainda não deve receber passageiros reais nem movimentar BRL em produção antes da contratação dos parceiros, da validação jurídica e da implantação dos controles descritos neste documento.

> Este documento é uma avaliação estratégica e técnica. Não substitui parecer jurídico, regulatório, contábil ou tributário.
