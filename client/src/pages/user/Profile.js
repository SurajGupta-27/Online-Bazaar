import React, { useState, useEffect } from "react";
import UserMenu from "../../components/Layout/UserMenu";
import Layout from "./../../components/Layout/Layout";
import { useAuth } from "../../context/auth";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { errorMessage } from "../../utils/errorMessage";
import AlertSettings from "../../components/Form/AlertSettings";
import "../../styles/AuthStyles.css";
const Profile = () => {
  //context
  const [auth, setAuth] = useAuth();
  const navigate = useNavigate();
  // Where to go once the profile is complete (the cart sends "/cart").
  const returnTo = useLocation().state;
  //state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Accounts created with Google have no password, phone or address yet.
  const user = auth?.user;
  const noPassword = user?.hasPassword === false;
  const incomplete = !user?.phone || !user?.address;

  //get user data
  useEffect(() => {
    const { email, name, phone, address } = auth?.user || {};
    setName(name || "");
    setPhone(phone || "");
    setEmail(email || "");
    setAddress(address || "");
  }, [auth?.user]);

  // form function
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await axios.put("/api/v1/auth/profile", {
        name,
        email,
        password,
        phone,
        address,
      });
      if (!data?.success) {
        toast.error(data?.message || "Unable to update profile");
      } else {
        setAuth({ ...auth, user: data?.updatedUser });
        let ls = localStorage.getItem("auth");
        ls = JSON.parse(ls);
        ls.user = data.updatedUser;
        localStorage.setItem("auth", JSON.stringify(ls));
        setPassword("");
        toast.success("Profile Updated Successfully");
        if (returnTo && data.updatedUser.phone && data.updatedUser.address) {
          navigate(returnTo);
        }
      }
    } catch (error) {
      console.log(error);
      toast.error(errorMessage(error, "Unable to update profile"));
    }
  };
  return (
    <Layout title={"Your Profile"}>
      <div className="container-fluid m-3 p-3">
        <div className="row">
          <div className="col-md-3">
            <UserMenu />
          </div>
          <div className="col-md-9">
            <div className="form-container ">
              <form onSubmit={handleSubmit}>
                <h4 className="title">USER PROFILE</h4>
                {user?.googleLinked && (
                  <p className="profile-note">Signed in with Google</p>
                )}
                {incomplete && (
                  <div className="alert alert-warning" role="alert">
                    Add your phone number and delivery address to place orders.
                  </div>
                )}
                <div className="mb-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-control"
                    id="exampleInputEmail1"
                    placeholder="Enter Your Name"
                    aria-label="Name"
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-control"
                    id="exampleInputEmail1"
                    placeholder="Enter Your Email "
                    aria-label="Email"
                    disabled
                  />
                </div>
                <div className="mb-3">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-control"
                    id="exampleInputPassword1"
                    placeholder={
                      noPassword ? "Set a password (optional)" : "Enter Your Password"
                    }
                    aria-label={noPassword ? "Set a password" : "Password"}
                    minLength={6}
                    autoComplete="new-password"
                  />
                  {noPassword && (
                    <small className="form-text text-muted">
                      You sign in with Google. Set a password to also log in with your email.
                    </small>
                  )}
                </div>
                <div className="mb-3">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="form-control"
                    id="exampleInputEmail1"
                    placeholder="Enter Your Phone"
                    aria-label="Phone"
                  />
                </div>
                <div className="mb-3">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="form-control"
                    id="exampleInputEmail1"
                    placeholder="Enter Your Address"
                    aria-label="Address"
                  />
                </div>

                <button type="submit" className="btn btn-primary">
                  UPDATE
                </button>
              </form>
              <AlertSettings />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
