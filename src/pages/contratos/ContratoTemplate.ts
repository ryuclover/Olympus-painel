import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { DadosContrato } from './ContratoWizard';

export function gerarTemplateContrato(dados: DadosContrato): TDocumentDefinitions {
  
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [ 50, 60, 50, 60 ],
    
    // Configuração de estilos do documento
    styles: {
      titulo: {
        fontSize: 14,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 20]
      },
      clausula: {
        fontSize: 12,
        bold: true,
        margin: [0, 15, 0, 5]
      },
      texto: {
        fontSize: 11,
        alignment: 'justify',
        lineHeight: 1.5,
        margin: [0, 0, 0, 8]
      },
      assinaturas: {
        fontSize: 11,
        alignment: 'center',
        margin: [0, 50, 0, 0]
      }
    },

    content: [
      { text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE DESENVOLVIMENTO DE LANDING PAGE', style: 'titulo' },
      
      {
        text: 'Pelo presente instrumento particular, as partes abaixo qualificadas celebram entre si este Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:',
        style: 'texto'
      },

      { text: '1. DAS PARTES', style: 'clausula' },
      {
        text: `CONTRATADA: ${dados.prestador_nome}, ${dados.prestador_tipo === 'PF' ? 'CPF' : 'CNPJ'} nº ${dados.prestador_doc}, com endereço em ${dados.prestador_endereco}, e-mail ${dados.prestador_email}.`,
        style: 'texto'
      },
      {
        text: `CONTRATANTE: ${dados.cliente_nome}, ${dados.cliente_tipo === 'PF' ? 'CPF' : 'CNPJ'} nº ${dados.cliente_doc}, com endereço em ${dados.cliente_endereco}, e-mail ${dados.cliente_email}.`,
        style: 'texto'
      },

      { text: '2. DO OBJETO', style: 'clausula' },
      {
        text: `2.1. O presente Contrato tem por objeto a prestação de serviços de desenvolvimento e implementação de uma Landing Page (Página de Destino) denominada "${dados.projeto_nome}".`,
        style: 'texto'
      },
      {
        text: `2.2. A descrição breve do projeto consiste em: ${dados.projeto_descricao}. A Landing Page terá um limite máximo de ${dados.projeto_secoes} seções.`,
        style: 'texto'
      },

      { text: '3. DO ESCOPO DOS SERVIÇOS', style: 'clausula' },
      {
        text: '3.1. Estão incluídos expressamente neste serviço os seguintes itens:',
        style: 'texto'
      },
      {
        ul: dados.itens_incluidos.map(item => ({ text: item, style: 'texto' }))
      },
      ...(dados.itens_excluidos ? [
        {
          text: `3.2. Fica expressamente estabelecido que NÃO estão incluídos no escopo: ${dados.itens_excluidos}.`,
          style: 'texto'
        }
      ] : []),

      { text: '4. DO PREÇO E CONDIÇÕES DE PAGAMENTO', style: 'clausula' },
      {
        text: `4.1. Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA o valor total de R$ ${dados.valor_total.toFixed(2).replace('.', ',')}.`,
        style: 'texto'
      },
      {
        text: dados.pagamento_forma === 'integral'
          ? '4.2. O pagamento será realizado em parcela única (integral).'
          : dados.pagamento_forma === 'entrada_saldo'
          ? `4.2. O pagamento será realizado em duas parcelas, sendo: ${dados.pagamento_entrada_pct}% a título de entrada na assinatura deste instrumento, e os ${dados.pagamento_saldo_pct}% restantes na entrega do projeto finalizado.`
          : `4.2. Condição de pagamento personalizada: ${dados.pagamento_custom}`,
        style: 'texto'
      },

      { text: '5. DOS PRAZOS E ALTERAÇÕES', style: 'clausula' },
      {
        text: `5.1. A CONTRATADA se compromete a entregar a primeira versão do projeto em até ${dados.prazo_versao_dias} dias úteis, contados da aprovação do pagamento da entrada (se houver) e do recebimento de todo o material necessário (textos, imagens, acessos) por parte da CONTRATANTE.`,
        style: 'texto'
      },
      {
        text: `5.2. Estão incluídas no escopo deste contrato até ${dados.qtd_alteracoes} rodadas de alterações. Solicitações que ultrapassem este limite poderão ser cobradas à parte, mediante orçamento prévio.`,
        style: 'texto'
      },
      {
        text: `5.3. A CONTRATANTE terá o prazo de ${dados.prazo_feedback_dias} dias úteis para aprovar ou solicitar alterações em cada etapa entregue. O silêncio será considerado como aprovação tácita.`,
        style: 'texto'
      },

      { text: '6. DO DOMÍNIO E HOSPEDAGEM', style: 'clausula' },
      {
        text: `6.1. O registro do domínio e a contratação da hospedagem são de responsabilidade ${dados.hospedagem === 'cliente' ? 'da CONTRATANTE' : 'da CONTRATADA'}.`,
        style: 'texto'
      },

      { text: '7. DO SUPORTE E MANUTENÇÃO', style: 'clausula' },
      {
        text: dados.suporte_incluso 
          ? `7.1. A CONTRATADA fornecerá suporte técnico e garantia contra falhas de programação (bugs) pelo prazo de ${dados.suporte_dias} dias contados da entrega final.` 
          : '7.1. Não está incluído serviço de suporte técnico ou garantia estendida após a entrega final do projeto aprovado.',
        style: 'texto'
      },
      {
        text: dados.manutencao_inclusa
          ? `7.2. Fica contratado o serviço de manutenção mensal no valor de R$ ${dados.manutencao_valor.toFixed(2).replace('.', ',')}, que será faturado separadamente.`
          : '7.2. Não estão incluídos serviços contínuos de manutenção, atualização de conteúdo ou otimização após a entrega.',
        style: 'texto'
      },

      { text: '8. DA RESCISÃO', style: 'clausula' },
      {
        text: '8.1. O presente contrato poderá ser rescindido por qualquer das partes, mediante aviso prévio de 15 (quinze) dias, arcando a parte que deu causa à rescisão com o valor correspondente ao trabalho já executado ou multa de 20% sobre o saldo remanescente, o que for maior.',
        style: 'texto'
      },

      { text: '9. DO FORO', style: 'clausula' },
      {
        text: '9.1. As partes elegem o foro da comarca da CONTRATADA para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.',
        style: 'texto'
      },

      {
        text: 'E, por estarem justos e contratados, assinam o presente em 02 (duas) vias de igual teor e forma.',
        style: 'texto',
        margin: [0, 20, 0, 40]
      },

      {
        columns: [
          {
            width: '*',
            text: [
              '__________________________________________\n',
              { text: 'CONTRATANTE\n', bold: true },
              dados.cliente_nome
            ],
            style: 'assinaturas'
          },
          {
            width: '*',
            text: [
              '__________________________________________\n',
              { text: 'CONTRATADA\n', bold: true },
              dados.prestador_nome
            ],
            style: 'assinaturas'
          }
        ]
      },
      {
        text: `Data: ____/____/________`,
        alignment: 'center',
        margin: [0, 40, 0, 0]
      }
    ]
  };

  return docDefinition;
}
