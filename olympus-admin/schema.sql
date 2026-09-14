-- Schema SQL para o Banco de Dados Admin Olympus (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do Supabase ou Neon para criar a estrutura segura:

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    cargo TEXT NOT NULL DEFAULT 'membro', -- 'superadmin', 'admin', 'membro'
    plano TEXT NOT NULL DEFAULT 'pro', -- 'trial', 'pro', 'vitalicio'
    status TEXT NOT NULL DEFAULT 'ativo', -- 'ativo', 'bloqueado', 'expirado'
    expira_em TIMESTAMP WITH TIME ZONE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    ultimo_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);

-- Inserir usuário Superadmin inicial (Senha padrão: admin123 -> recomendamos alterar no primeiro login)
-- Hash Bcrypt para 'admin123' com 10 rounds:
INSERT INTO usuarios (nome, email, senha_hash, cargo, plano, status)
VALUES (
    'Gabriel Superadmin',
    'admin@olympus.app',
    '$2a$10$7Z8KqD2oNf4JzS/i8r47w.kM5YQ7yU60oM2YyO6z8XWqF7N7YjVvG',
    'superadmin',
    'vitalicio',
    'ativo'
)
ON CONFLICT (email) DO NOTHING;
