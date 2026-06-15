/**
 * city.jsx — global "selected city" state, shared across all pages.
 *
 * Like real BookMyShow, the chosen city filters the whole catalog:
 *  - HomePage passes it to GET /movies
 *  - ShowSelectionPage passes it to GET /shows
 *
 * The list of cities is loaded from GET /cities (data-driven), and the user's
 * choice is persisted to localStorage so it survives a refresh.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "./api";

const CityContext = createContext(null);
const CITY_KEY = "bms_city";

export function CityProvider({ children }) {
  const [cities, setCities] = useState([]);
  const [city, setCityState] = useState(() => localStorage.getItem(CITY_KEY) || "");

  // Load the available cities once on mount
  useEffect(() => {
    api.getCities()
      .then((list) => {
        setCities(list);
        // Keep the stored city if still valid; otherwise prefer Mumbai, else first
        setCityState((curr) => {
          if (curr && list.includes(curr)) return curr;
          if (list.includes("Mumbai")) return "Mumbai";
          return list[0] || "";
        });
      })
      .catch(() => {});
  }, []);

  const setCity = useCallback((c) => {
    setCityState(c);
    localStorage.setItem(CITY_KEY, c);
  }, []);

  return (
    <CityContext.Provider value={{ city, cities, setCity }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCity() {
  return useContext(CityContext);
}
