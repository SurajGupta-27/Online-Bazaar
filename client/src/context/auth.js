import { useState, useEffect, useContext, createContext } from "react";
import axios from "axios";
import toast from "react-hot-toast";

const AuthContext = createContext();

const signedOut = { user: null, token: "" };

// These return 401 for bad credentials, which doesn't mean the session expired.
const CREDENTIAL_ROUTES = ["/api/v1/auth/login", "/api/v1/auth/forgot-password"];

// True when the JWT's exp claim is in the past (or the token is unreadable).
const isExpired = (token) => {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch (error) {
    return true;
  }
};

const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(signedOut);

  //default axios
  axios.defaults.headers.common["Authorization"] = auth?.token;

  useEffect(() => {
    const data = localStorage.getItem("auth");
    if (data) {
      const parseData = JSON.parse(data);
      if (!parseData.token || isExpired(parseData.token)) {
        localStorage.removeItem("auth");
        return;
      }
      // Older builds stored the password hash and security answer; purge them.
      if (parseData.user) {
        const { password, answer, ...safeUser } = parseData.user;
        if (password !== undefined || answer !== undefined) {
          parseData.user = safeUser;
          localStorage.setItem("auth", JSON.stringify(parseData));
        }
      }
      setAuth({
        user: parseData.user,
        token: parseData.token,
      });
    }
  }, []);

  // If the API rejects our token (expired, or the account was removed), sign
  // out instead of leaving the user "logged in" with every request failing.
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const sentToken = error.config?.headers?.Authorization;
        const url = error.config?.url || "";
        if (
          error.response?.status === 401 &&
          sentToken &&
          !CREDENTIAL_ROUTES.some((route) => url.startsWith(route)) &&
          localStorage.getItem("auth")
        ) {
          localStorage.removeItem("auth");
          setAuth(signedOut);
          toast.error("Your session has expired. Please log in again.");
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  return (
    <AuthContext.Provider value={[auth, setAuth]}>
      {children}
    </AuthContext.Provider>
  );
};

// custom hook
const useAuth = () => useContext(AuthContext);

export { useAuth, AuthProvider };
