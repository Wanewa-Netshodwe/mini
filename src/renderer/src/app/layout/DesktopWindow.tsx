import { Outlet } from "react-router-dom";
import { TitleBar } from "@renderer/app/shared/TitleBar";

export const DesktopWindow = () => {
  return (
    <div className="w-screen h-screen bg-primary text-text font-poppins flex flex-col">
      <TitleBar />
      <Outlet />
    </div>
  );
};