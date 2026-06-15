import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth";
import { CityProvider } from "./city";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import ShowSelectionPage from "./pages/ShowSelectionPage";
import SeatPickerPage from "./pages/SeatPickerPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import AgentPage from "./pages/AgentPage";

export default function App() {
  return (
    <AuthProvider>
      <CityProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"                     element={<HomePage />} />
          <Route path="/login"                element={<AuthPage />} />
          <Route path="/movies/:movieId"      element={<ShowSelectionPage />} />
          <Route path="/shows/:showId/seats"  element={<SeatPickerPage />} />
          <Route path="/confirmed/:bookingId" element={<ConfirmationPage />} />
          <Route path="/bookings"             element={<MyBookingsPage />} />
          <Route path="/agent"                element={<AgentPage />} />
        </Routes>
      </BrowserRouter>
      </CityProvider>
    </AuthProvider>
  );
}
