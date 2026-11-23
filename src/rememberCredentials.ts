export function rememberCredentials(
  email: string,
  password: string,
  remember: boolean,
) {
  localStorage.setItem("vgm-remember", String(remember));
  if (!remember) {
    localStorage.removeItem("vgm-login-email");
    return;
  }
  localStorage.setItem("vgm-login-email", email);
  const Constructor = (
    window as Window & {
      PasswordCredential?: new (data: {
        id: string;
        password: string;
      }) => Credential;
    }
  ).PasswordCredential;
  if (Constructor && navigator.credentials)
    void navigator.credentials
      .store(new Constructor({ id: email, password }))
      .catch(() => {});
}
