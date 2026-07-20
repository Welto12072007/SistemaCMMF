import { useRef } from 'react'
import { Printer, X } from 'lucide-react'

interface ContratoProps {
  aluno: {
    nome?: string
    data_nascimento?: string
    cpf?: string
    endereco_rua?: string
    endereco_numero?: string
    endereco_complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
    cep?: string
    instrumento_interesse?: string
    modalidade_preferida?: string
    valor_plano?: number
    nome_responsavel?: string
    data_nascimento_responsavel?: string
    cpf_responsavel?: string
  }
  onClose: () => void
}

function formatDate(d?: string) {
  if (!d) return '___/___/___'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function mesExtenso(m: number) {
  return ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][m]
}

export default function ContratoModal({ aluno, onClose }: ContratoProps) {
  const ref = useRef<HTMLDivElement>(null)

  function imprimir() {
    const content = ref.current
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Contrato - ${aluno.nome || 'Aluno'}</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 2cm; line-height: 1.6; }
        h1 { text-align: center; font-size: 14pt; margin-bottom: 24pt; }
        h2 { font-size: 12pt; margin-top: 18pt; }
        .field { border-bottom: 1px solid #000; display: inline-block; min-width: 200px; padding: 0 4px; }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        td, th { border: 1px solid #000; padding: 6px 8px; text-align: center; }
        .sig-line { border-top: 1px solid #000; width: 45%; display: inline-block; text-align: center; margin-top: 48pt; }
        .checkbox { font-family: monospace; }
        @media print { body { margin: 1.5cm; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const nome = aluno.nome || '___________________________________________'
  const nasc = formatDate(aluno.data_nascimento)
  const cpf = aluno.cpf || '___.___.___-__'
  const endereco = [aluno.endereco_rua, aluno.endereco_numero, aluno.endereco_complemento].filter(Boolean).join(', ') || '______________________________'
  const bairro = aluno.bairro || '______________'
  const cidade = aluno.cidade || 'Campo Bom'
  const estado = aluno.estado || 'RS'
  const cep = aluno.cep || '_____-___'
  const instrumento = aluno.instrumento_interesse || '[instrumento]'
  const plano = aluno.valor_plano
  const isIndividual = (plano && plano >= 280) || aluno.modalidade_preferida?.toLowerCase().includes('individual')
  const isSemestral = plano === 280
  const hoje = new Date()

  // Responsável (se menor)
  const resp = aluno.nome_responsavel
  const respNasc = formatDate(aluno.data_nascimento_responsavel)
  const respCpf = aluno.cpf_responsavel || '___.___.___-__'

  const contratanteText = resp
    ? `${resp}, nascido em ${respNasc}, inscrito no CPF ${respCpf}, responsável legal pelo aluno ${nome}, residente na rua ${endereco}, Bairro ${bairro}, Cidade ${cidade}/${estado}, CEP: ${cep}.`
    : `${nome}, nascido em ${nasc}, inscrito no CPF ${cpf}, residente na rua ${endereco}, Bairro ${bairro}, Cidade ${cidade}/${estado}, CEP: ${cep}.`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contrato — {aluno.nome}</h2>
          <div className="flex items-center gap-2">
            <button onClick={imprimir} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-8" style={{ fontFamily: "'Times New Roman', serif", fontSize: '11pt', lineHeight: '1.7' }}>
          <div ref={ref}>
            <h1 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 'bold', marginBottom: '20px' }}>
              CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS – ENSINO MUSICAL
            </h1>

            <p><strong>CONTRATANTE</strong></p>
            <p>{contratanteText}</p>

            <p><strong>CONTRATADA</strong></p>
            <p>MURILO ANTÔNIO FINGER DA SILVA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 29.247.149/0001-51, com sede na Rua dos Andradas, nº 261, sala 204, Bairro Centro, Cidade de Campo Bom/RS, CEP: 93700-000, doravante denominada CONTRATADA.</p>

            <p><strong>CLÁUSULA 1ª – OBJETO:</strong></p>
            <p>O presente contrato tem como objeto a prestação de serviços de ensino musical, consistentes na ministração de aulas de <strong>{instrumento}</strong> contratadas sob a forma de plano {isSemestral ? 'semestral' : 'mensal'}, {isIndividual ? 'individual' : 'em grupo'}, pelo período mínimo de {isSemestral ? '6 (seis) meses' : '1 (um) mês'}, conforme os valores e condições abaixo especificados.</p>
            <p><em>Parágrafo Único:</em> A matrícula será efetivada mediante pagamento da taxa no valor de R$100,00 (cem reais), que inclui material didático de teoria musical e acesso à plataforma digital de ensino.</p>

            <p><strong>CLÁUSULA 2ª – DOS VALORES E FORMA DE PAGAMENTO</strong></p>
            <p>Pelos serviços educacionais prestados o(a) CONTRATANTE pagará à CONTRATADA os valores conforme o plano escolhido no ato da contratação:</p>

            <table style={{ borderCollapse: 'collapse', width: '100%', margin: '12px 0' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '6px' }}>PLANO:</th>
                  <th style={{ border: '1px solid #000', padding: '6px' }}>MENSAL</th>
                  <th style={{ border: '1px solid #000', padding: '6px' }}>SEMESTRAL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>Individual</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>R$320,00 {plano === 320 ? '( X )' : '(     )'}</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>R$280,00 {plano === 280 ? '( X )' : '(     )'}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>Grupo</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>_________</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>R$180,00 {plano === 180 ? '( X )' : '(     )'}</td>
                </tr>
              </tbody>
            </table>

            <p><em>Parágrafo Primeiro:</em> Em caso de pagamento antecipado do plano anual, poderá ser concedido desconto, a critério exclusivo da CONTRATADA.</p>
            <p><em>Parágrafo Segundo:</em> Será concedido desconto de 10% (dez por cento) sobre o valor das aulas individuais aos alunos que optarem por mais de uma aula semanal.</p>
            <p><em>Parágrafo Terceiro:</em> O pagamento deverá ser realizado mensalmente, impreterivelmente até o dia 10 (dez) de cada mês, sendo considerado em atraso após essa data.</p>
            <p><em>Parágrafo Quarto:</em> Em caso de atraso no pagamento, será aplicada multa de 10% (dez por cento) sobre o valor devido, acrescida de juros de 1% (um por cento) ao mês, além de correção monetária.</p>
            <p><em>Parágrafo Quinto:</em> Em caso de atraso de 1 (uma) mensalidade, poderá ocorrer a suspensão das aulas até a regularização do débito pendente.</p>
            <p><em>Parágrafo Sexto:</em> O inadimplemento poderá ensejar a cobrança extrajudicial ou judicial do débito, podendo ser acrescidos custos administrativos e honorários advocatícios.</p>
            <p><em>Parágrafo Sétimo:</em> O reajuste das mensalidades será realizado quando houver necessidade e com aviso prévio mínimo de 30 dias.</p>

            <p><strong>CLÁUSULA 3ª – DA RESCISÃO CONTRATUAL</strong></p>
            <p><em>Parágrafo Primeiro:</em> O presente contrato poderá ser rescindido nas seguintes hipóteses:</p>
            <p>I – Por iniciativa do CONTRATANTE, mediante desistência formal, com assinatura do termo de cancelamento de matrícula e aviso prévio por escrito com antecedência mínima de 30 (trinta) dias.</p>
            <p>II – Por iniciativa da CONTRATADA, nos seguintes casos:</p>
            <p style={{ paddingLeft: '20px' }}>a) Descumprimento das obrigações contratuais pelo CONTRATANTE;<br/>
            b) Inadimplência;<br/>
            c) Desligamento conforme critérios internos da CONTRATADA.</p>
            <p><em>Parágrafo Segundo:</em> O plano semestral possui duração mínima de 6 (seis) meses, com início na data de assinatura do presente contrato. Findo o prazo estabelecido, o contrato será automaticamente renovado por prazo indeterminado, passando a vigorar sob as mesmas condições.</p>
            <p><em>Parágrafo Terceiro:</em> Caso o contrato seja rescindido antes do prazo mínimo de 6 (seis) meses por iniciativa do CONTRATANTE, este ficará sujeito ao pagamento de multa equivalente a 50% (cinquenta por cento) do saldo remanescente das parcelas vincendas.</p>
            <p><em>Parágrafo Quarto:</em> O descumprimento das obrigações previstas neste contrato poderá ensejar a cobrança extrajudicial ou judicial dos valores devidos, ficando o inadimplente responsável pelos encargos.</p>

            <p><strong>CLÁUSULA 4ª – DAS AULAS, FALTAS E REPOSIÇÕES</strong></p>
            <p><em>Parágrafo Primeiro:</em> O aluno deverá cumprir os horários estabelecidos pela CONTRATADA para início e término das aulas. Cada aula terá duração de 45 (quarenta e cinco) minutos.</p>
            <p><em>Parágrafo Segundo:</em> Em caso de ausência do aluno, por qualquer motivo, o CONTRATANTE deverá comunicar previamente à CONTRATADA ou ao professor responsável.</p>
            <p><em>Parágrafo Terceiro:</em> O não comparecimento do aluno às aulas não exime o CONTRATANTE do pagamento das mensalidades, tendo em vista a disponibilidade do professor e da estrutura.</p>
            <p><em>Parágrafo Quarto:</em> Nas aulas individuais, em caso de falta justificada e comunicada com antecedência mínima de 1 (um) dia, será permitida a reposição de até 1 (uma) aula por mês.</p>
            <p><em>Parágrafo Quinto:</em> Nas aulas em grupo, eventuais alterações de dia ou horário poderão ocorrer mediante acordo entre todos os integrantes da turma e aviso prévio da CONTRATADA.</p>
            <p><em>Parágrafo Sexto:</em> Na hipótese de ausência do professor, os alunos serão previamente informados, sendo assegurada a reposição da aula em dia e horário a serem combinados.</p>

            <p><strong>CLÁUSULA 5ª – DAS FÉRIAS</strong></p>
            <p><em>Parágrafo Primeiro:</em> A CONTRATADA poderá conceder férias coletivas aos seus colaboradores, com a consequente suspensão temporária das atividades, pelo período de até 30 (trinta) dias ao ano.</p>
            <p><em>Parágrafo Segundo:</em> O período de férias coletivas integra o planejamento anual do curso e não implicará redução, abatimento ou isenção do pagamento das mensalidades.</p>

            <p><strong>CLÁUSULA 6ª – DOS MATERIAIS E INSTRUMENTOS</strong></p>
            <p><em>Parágrafo Primeiro:</em> O CONTRATANTE é responsável por providenciar os materiais e instrumentos necessários para a realização das aulas, podendo consultar a CONTRATADA para orientação.</p>
            <p><em>Parágrafo Segundo:</em> A CONTRATADA permanece à disposição para esclarecimento de dúvidas, bem como para orientar e indicar a aquisição de materiais e instrumentos adequados.</p>

            <p><strong>CLÁUSULA 7ª – DO USO DE IMAGEM</strong></p>
            <p><em>Parágrafo Primeiro:</em> O CONTRATANTE, ou seu responsável legal, autoriza o uso de sua imagem (ou do aluno) em fotos, vídeos e demais materiais de divulgação da CONTRATADA.</p>
            <p><em>Parágrafo Segundo:</em> A presente autorização é concedida sem limitação de tempo, desde que não haja desvirtuamento da finalidade das imagens.</p>
            <p><em>Parágrafo Terceiro:</em> Caso não concorde com o uso de imagem, o CONTRATANTE deverá assinalar a opção abaixo:</p>
            <p className="checkbox">( ) NÃO AUTORIZO o uso de imagem.</p>

            <p><strong>CLÁUSULA 8ª – DO TRATAMENTO DE DADOS</strong></p>
            <p>O CONTRATANTE declara estar ciente e concorda que a CONTRATADA realizará a coleta, o tratamento e o armazenamento dos dados pessoais necessários à execução deste contrato, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
            <p><em>Parágrafo único:</em> O CONTRATANTE autoriza, ainda, o compartilhamento de dados quando necessário para a proteção do crédito, cobrança de valores devidos ou cumprimento de obrigação legal.</p>

            <p><strong>CLÁUSULA 9ª – DO FORO</strong></p>
            <p>As partes elegem o foro da comarca de Campo Bom/RS para dirimir quaisquer controvérsias oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>

            <p style={{ marginTop: '24px' }}>E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor e forma, juntamente com as testemunhas abaixo.</p>

            <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ borderTop: '1px solid #000', width: '45%', textAlign: 'center', paddingTop: '4px' }}>CONTRATANTE</div>
              <div style={{ borderTop: '1px solid #000', width: '45%', textAlign: 'center', paddingTop: '4px' }}>MURILO ANTÔNIO FINGER DA SILVA</div>
            </div>

            <div style={{ marginTop: '48px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ borderTop: '1px solid #000', width: '45%', textAlign: 'center', paddingTop: '4px' }}>TESTEMUNHA I</div>
              <div style={{ borderTop: '1px solid #000', width: '45%', textAlign: 'center', paddingTop: '4px' }}>TESTEMUNHA II</div>
            </div>

            <p style={{ marginTop: '36px', textAlign: 'center' }}>
              CAMPO BOM, ___ de {mesExtenso(hoje.getMonth())} de {hoje.getFullYear()}.
            </p>

            <p style={{ marginTop: '24px' }}><strong>ANEXO I – DOS DIAS E HORÁRIOS DAS AULAS</strong></p>
            <p>Fica definido e acordado entre CONTRATANTE e CONTRATADA o(s) dia(s) e horário(s) para a realização das aulas, conforme especificado abaixo:</p>

            <table style={{ borderCollapse: 'collapse', width: '100%', margin: '12px 0' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>DIA</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>HORA</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>DATA</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>ASSINATURA</th>
                </tr>
              </thead>
              <tbody>
                {[0,1,2].map(i => (
                  <tr key={i}>
                    <td style={{ border: '1px solid #000', padding: '8px', height: '30px' }}></td>
                    <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                    <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                    <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
