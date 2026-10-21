import { useState, useEffect, useContext, createContext, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "./auth";
import { errorMessage } from "../utils/errorMessage";

// Without a provider (e.g. a component rendered on its own in a test), there
// are no alerts and changes do nothing.
const AlertsContext = createContext([[], async () => {}, async () => {}]);

export const awaitingRestock = (restock, productId) => restock.includes(productId);

// The user's alert settings ({ priceDrop, backInStock }); missing means on.
export const alertSettings = (user) => ({
  priceDrop: user?.alerts?.priceDrop !== false,
  backInStock: user?.alerts?.backInStock !== false,
});

// The ids of the out-of-stock products the signed-in user asked to hear about
// ("Notify me when available"), kept in the database.
const AlertsProvider = ({ children }) => {
  const [auth] = useAuth();
  const [restock, setRestock] = useState([]);
  const token = auth?.token;

  useEffect(() => {
    if (!token) {
      setRestock([]);
      return;
    }
    let current = true;
    axios
      .get("/api/v1/alerts/restock")
      .then(({ data }) => current && setRestock(data?.products || []))
      .catch((error) => console.error(error));
    return () => {
      current = false;
    };
  }, [token]);

  // Both update at once and are rolled back if the API refuses.
  const requestRestock = useCallback(async (productId) => {
    setRestock((ids) => (ids.includes(productId) ? ids : [...ids, productId]));
    try {
      await axios.post(`/api/v1/alerts/restock/${productId}`);
    } catch (error) {
      setRestock((ids) => ids.filter((id) => id !== productId));
      toast.error(errorMessage(error, "Couldn't set up the alert"));
      throw error;
    }
  }, []);

  const cancelRestock = useCallback(async (productId) => {
    setRestock((ids) => ids.filter((id) => id !== productId));
    try {
      await axios.delete(`/api/v1/alerts/restock/${productId}`);
    } catch (error) {
      setRestock((ids) => (ids.includes(productId) ? ids : [...ids, productId]));
      toast.error(errorMessage(error, "Couldn't cancel the alert"));
      throw error;
    }
  }, []);

  return (
    <AlertsContext.Provider value={[restock, requestRestock, cancelRestock]}>
      {children}
    </AlertsContext.Provider>
  );
};

// const [restock, requestRestock, cancelRestock] = useAlerts();
const useAlerts = () => useContext(AlertsContext);

export { useAlerts, AlertsProvider };
