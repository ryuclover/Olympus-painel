export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const body = await response.text()

  if (!body.trim()) {
    throw new Error(`A API respondeu vazia (${response.status}). Verifique se o backend está ativo.`)
  }

  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`A API respondeu em formato inválido (${response.status}).`)
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'erro' in data
      ? String(data.erro)
      : `Erro HTTP ${response.status}`
    throw new Error(message)
  }

  return data as T
}
