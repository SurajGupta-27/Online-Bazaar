import React from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth";
import { errorMessage } from "../../utils/errorMessage";

// "Continue with Google" for the login and register pages. Google gives the
// browser an ID token (the credential); only that is sent to our API, which
// verifies it and answers with our usual user and JWT. Hidden when
// REACT_APP_GOOGLE_CLIENT_ID isn't set.
const GoogleSignIn = ({ redirectTo = "/", text = "continue_with" }) => {
  const [auth, setAuth] = useAuth();
  const navigate = useNavigate();
  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  const handleSuccess = async ({ credential }) => {
    try {
      const { data } = await axios.post("/api/v1/auth/google", { credential });
      setAuth({ ...auth, user: data.user, token: data.token });
      localStorage.setItem("auth", JSON.stringify(data));
      toast.success(data.message);
      if (!data.user.phone || !data.user.address) {
        toast("Add your phone number and address in your profile before checkout.", {
          icon: "📦",
        });
      }
      navigate(redirectTo);
    } catch (error) {
      console.log(error);
      toast.error(errorMessage(error, "Google sign-in failed. Please try again."));
    }
  };

  return (
    <div className="google-signin">
      <div className="auth-divider">
        <span>or</span>
      </div>
      <GoogleOAuthProvider clientId={clientId}>
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => toast.error("Google sign-in was cancelled or failed.")}
          text={text}
          shape="pill"
          width="300"
        />
      </GoogleOAuthProvider>
    </div>
  );
};

export default GoogleSignIn;
