import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { toSessionResponse, toTokenResponse } from '../dto/auth.dto.ts';
import { requireActor } from '../middlewares/authenticate.ts';
import { getValidated } from '../middlewares/validate-request.ts';
import type { AuthService } from '../services/auth.service.ts';
import type { IssuedRefreshToken } from '../services/token.service.ts';
import { changePasswordRequest, loginRequest, sessionIdRequest } from '../validators/auth.validators.ts';

/**
 * Refresh-token transport: an HttpOnly cookie.
 * - HttpOnly: page JavaScript cannot read it, so an XSS bug cannot steal it.
 * - Secure (production): only sent over HTTPS.
 * - SameSite=Strict: never sent on requests started by another site (CSRF protection,
 *   together with the CORS origin allowlist).
 * - Path=/api/v1/auth: not sent with ordinary API calls, only to the auth endpoints.
 * The access token travels in the response body and the Authorization header; clients
 * should keep it in memory, not in localStorage.
 */
export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface AuthControllerOptions {
  secureCookies: boolean;
}

export function createAuthController(auth: AuthService, options: AuthControllerOptions) {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
  const setRefreshCookie = (res: Response, refresh: IssuedRefreshToken) =>
    res.cookie(REFRESH_COOKIE, refresh.token, { ...cookieOptions, expires: refresh.expiresAt });
  const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieOptions);
  const readRefreshCookie = (req: Request): string | undefined => {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  };

  return {
    login: async (req, res) => {
      const { body } = getValidated(req, loginRequest);
      const result = await auth.login(body.email, body.password, req.get('user-agent'));
      setRefreshCookie(res, result.refreshToken);
      res.json(toTokenResponse(result, result.user));
    },

    refresh: async (req, res) => {
      try {
        const result = await auth.refresh(readRefreshCookie(req), req.requestId);
        setRefreshCookie(res, result.refreshToken);
        res.json(toTokenResponse(result));
      } catch (error) {
        clearRefreshCookie(res); // a rejected refresh token is useless: drop it
        throw error;
      }
    },

    logout: async (req, res) => {
      await auth.logout(readRefreshCookie(req));
      clearRefreshCookie(res);
      res.status(204).end();
    },

    logoutAll: async (req, res) => {
      await auth.logoutAll(requireActor(req));
      clearRefreshCookie(res);
      res.status(204).end();
    },

    listSessions: async (req, res) => {
      const actor = requireActor(req);
      const sessions = await auth.listSessions(actor);
      res.json({ items: sessions.map((session) => toSessionResponse(session, actor.sessionId)) });
    },

    revokeSession: async (req, res) => {
      const { params } = getValidated(req, sessionIdRequest);
      await auth.revokeSession(requireActor(req), params.id);
      res.status(204).end();
    },

    changePassword: async (req, res) => {
      const { body } = getValidated(req, changePasswordRequest);
      await auth.changePassword(requireActor(req), body.currentPassword, body.newPassword);
      clearRefreshCookie(res); // every session was revoked, including this one
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}

export type AuthController = ReturnType<typeof createAuthController>;
