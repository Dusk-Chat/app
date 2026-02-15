import { type JSX, type Component, type ParentProps } from "solid-js";
import UserFooter from "./UserFooter";

interface SidebarLayoutProps {
  header?: JSX.Element;
  footer?: JSX.Element;
  beforeFooter?: JSX.Element;
  showFooter?: boolean;
  showFooterSettings?: boolean;
  onFooterSettingsClick?: () => void;
}

const SidebarLayout: Component<ParentProps<SidebarLayoutProps>> = (props) => {
  return (
    <div class="w-full h-full bg-gray-900 flex flex-col">
      {/* header */}
      {props.header && (
        <div class="shrink-0">
          {props.header}
        </div>
      )}

      {/* body */}
      <div class="flex-1 overflow-y-auto">
        {props.children}
      </div>

      {/* voice controls or other content above the user footer */}
      {props.beforeFooter}

      {/* footer */}
      {props.showFooter && (
        <UserFooter
          showSettings={props.showFooterSettings}
          onSettingsClick={props.onFooterSettingsClick}
        />
      )}
    </div>
  );
};

export default SidebarLayout;
