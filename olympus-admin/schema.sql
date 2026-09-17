-- Execute no SQL Editor do Supabase.
-- Senhas pertencem ao Supabase Auth e nunca devem ser armazenadas nesta tabela.

CREATE TABLE IF NOT EXISTS public.usuarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        cargo TEXT NOT NULL DEFAULT 'membro' CHECK (cargo IN ('superadmin', 'admin', 'membro')),
        plano TEXT NOT NULL DEFAULT 'pro' CHECK (plano IN ('trial', 'pro', 'vitalicio')),
        status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'bloqueado', 'expirado')),
        expira_em TIMESTAMP WITH TIME ZONE,
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        ultimo_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON public.usuarios(status);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.usuario_admin_atual() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios
        WHERE lower(email) = lower(auth.jwt() ->> 'email')
            AND cargo IN ('admin', 'superadmin')
            AND status = 'ativo'
    );
$$;

REVOKE ALL ON FUNCTION public.usuario_admin_atual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_admin_atual() TO authenticated;

DROP POLICY IF EXISTS "admins podem consultar usuarios" ON public.usuarios;
CREATE POLICY "admins podem consultar usuarios"
    ON public.usuarios FOR SELECT TO authenticated
    USING (public.usuario_admin_atual());

DROP POLICY IF EXISTS "admins podem inserir usuarios" ON public.usuarios;
CREATE POLICY "admins podem inserir usuarios"
    ON public.usuarios FOR INSERT TO authenticated
    WITH CHECK (public.usuario_admin_atual());

DROP POLICY IF EXISTS "admins podem atualizar usuarios" ON public.usuarios;
CREATE POLICY "admins podem atualizar usuarios"
    ON public.usuarios FOR UPDATE TO authenticated
    USING (public.usuario_admin_atual())
    WITH CHECK (public.usuario_admin_atual());

DROP POLICY IF EXISTS "admins podem excluir usuarios" ON public.usuarios;
CREATE POLICY "admins podem excluir usuarios"
    ON public.usuarios FOR DELETE TO authenticated
    USING (public.usuario_admin_atual());

-- Crie o primeiro usuário pelo Supabase Auth e depois insira seu perfil:
-- INSERT INTO public.usuarios (nome, email, cargo, plano, status)
-- VALUES ('Administrador', 'seu-email@dominio.com', 'superadmin', 'vitalicio', 'ativo');
