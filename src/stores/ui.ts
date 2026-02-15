import { createSignal } from "solid-js";

const [sidebarVisible, setSidebarVisible] = createSignal(true);
const [channelListVisible, setChannelListVisible] = createSignal(true);
const [overlayMenuOpen, setOverlayMenuOpen] = createSignal(false);
const [isMobile, setIsMobile] = createSignal(false);
const [isTablet, setIsTablet] = createSignal(false);
const [activeModal, setActiveModal] = createSignal<string | null>(null);
const [modalData, setModalData] = createSignal<unknown>(null);

// profile card popover state
export interface ProfileCardTarget {
  peerId: string;
  displayName: string;
  // anchor coordinates for positioning the card
  anchorX: number;
  anchorY: number;
}

const [profileCardTarget, setProfileCardTarget] =
  createSignal<ProfileCardTarget | null>(null);

export function openProfileCard(target: ProfileCardTarget) {
  setProfileCardTarget(target);
}

export function closeProfileCard() {
  setProfileCardTarget(null);
}

// detailed profile modal state
const [profileModalPeerId, setProfileModalPeerId] = createSignal<string | null>(
  null,
);

export function openProfileModal(peerId: string) {
  // close the card popover when opening the full modal
  closeProfileCard();
  setProfileModalPeerId(peerId);
}

export function closeProfileModal() {
  setProfileModalPeerId(null);
}

export { profileCardTarget, profileModalPeerId };

function handleResize() {
  const width = window.innerWidth;
  setIsMobile(width < 768);
  setIsTablet(width >= 768 && width < 1440);

  // auto-hide panels on smaller screens
  if (width < 768) {
    setSidebarVisible(false);
    setChannelListVisible(false);
  } else if (width < 1440) {
    setSidebarVisible(false);
    setChannelListVisible(true);
  } else {
    setSidebarVisible(true);
    setChannelListVisible(true);
  }
}

// call this in the root component to set up the resize listener
export function initResponsive() {
  handleResize();
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}

export function toggleSidebar() {
  setSidebarVisible((v) => !v);
}

export function toggleChannelList() {
  setChannelListVisible((v) => !v);
}

export function openOverlay() {
  setOverlayMenuOpen(true);
}

export function closeOverlay() {
  setOverlayMenuOpen(false);
}

export function openModal(name: string, data?: unknown) {
  setActiveModal(name);
  setModalData(data ?? null);
}

export function closeModal() {
  setActiveModal(null);
  setModalData(null);
}

export {
  sidebarVisible,
  channelListVisible,
  overlayMenuOpen,
  isMobile,
  isTablet,
  activeModal,
  modalData,
};
