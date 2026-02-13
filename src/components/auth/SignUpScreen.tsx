import { Component, createSignal, Show } from "solid-js";
import { Key, User, ArrowRight, Shield } from "lucide-solid";
import Button from "../common/Button";
import Avatar from "../common/Avatar";

interface SignUpScreenProps {
  onComplete: (displayName: string, bio: string) => void;
}

const SignUpScreen: Component<SignUpScreenProps> = (props) => {
  const [displayName, setDisplayName] = createSignal("");
  const [bio, setBio] = createSignal("");
  const [step, setStep] = createSignal<"welcome" | "profile">("welcome");
  const [isCreating, setIsCreating] = createSignal(false);

  function handleBegin() {
    setStep("profile");
  }

  async function handleCreate() {
    const name = displayName().trim();
    if (!name) return;

    setIsCreating(true);
    props.onComplete(name, bio().trim());
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (step() === "welcome") {
        handleBegin();
      } else if (displayName().trim()) {
        handleCreate();
      }
    }
  }

  return (
    <div
      class="h-screen w-screen bg-black flex items-center justify-center overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      <Show
        when={step() === "profile"}
        fallback={
          // welcome screen
          <div class="max-w-[520px] w-full mx-4 animate-fade-in">
            <div class="mb-12">
              <h1 class="text-[48px] leading-[56px] font-bold text-white tracking-[-0.02em] mb-4">
                dusk
              </h1>
              <p class="text-[20px] leading-[28px] text-white/60">
                peer-to-peer communication. no servers, no surveillance, no
                compromise.
              </p>
            </div>

            <div class="flex flex-col gap-6 mb-12">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-white/20">
                  <Key size={18} class="text-orange" />
                </div>
                <div>
                  <p class="text-[16px] font-medium text-white mb-1">
                    keypair identity
                  </p>
                  <p class="text-[14px] text-white/40">
                    your identity is a cryptographic keypair generated on your
                    device. no email, no phone number, no corporate account.
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-4">
                <div class="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-white/20">
                  <Shield size={18} class="text-orange" />
                </div>
                <div>
                  <p class="text-[16px] font-medium text-white mb-1">
                    your data, your hardware
                  </p>
                  <p class="text-[14px] text-white/40">
                    everything is stored locally and synced directly between
                    peers. no central server ever touches your messages.
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-4">
                <div class="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-white/20">
                  <User size={18} class="text-orange" />
                </div>
                <div>
                  <p class="text-[16px] font-medium text-white mb-1">
                    portable identity
                  </p>
                  <p class="text-[14px] text-white/40">
                    take your identity anywhere. your keypair is yours forever
                    and works across any device running dusk.
                  </p>
                </div>
              </div>
            </div>

            <Button variant="primary" fullWidth onClick={handleBegin}>
              <span class="flex items-center gap-2">
                get started
                <ArrowRight size={16} />
              </span>
            </Button>
          </div>
        }
      >
        {/* profile creation screen */}
        <div class="max-w-[480px] w-full mx-4 animate-fade-in">
          <h2 class="text-[32px] leading-[40px] font-bold text-white tracking-[-0.02em] mb-2">
            create your identity
          </h2>
          <p class="text-[16px] text-white/40 mb-8">
            choose a display name for the network. you can change this later.
          </p>

          {/* live preview */}
          <div class="flex items-center gap-4 p-4 border-2 border-white/10 mb-8">
            <Avatar
              name={displayName() || "?"}
              size="xl"
              status="Online"
              showStatus
            />
            <div class="min-w-0 flex-1">
              <p class="text-[20px] font-bold text-white truncate">
                {displayName() || "your name"}
              </p>
              <Show when={bio()}>
                <p class="text-[14px] text-white/40 truncate mt-1">{bio()}</p>
              </Show>
              <p class="text-[12px] font-mono text-white/20 mt-1">
                peer id will be generated
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-4 mb-8">
            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                display name *
              </label>
              <input
                type="text"
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200"
                placeholder="what should people call you?"
                value={displayName()}
                onInput={(e) => setDisplayName(e.currentTarget.value)}
                maxLength={32}
                autofocus
              />
              <p class="text-[12px] font-mono text-white/20 mt-1">
                {displayName().length}/32
              </p>
            </div>

            <div>
              <label class="block text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 mb-2">
                bio (optional)
              </label>
              <textarea
                class="w-full bg-black border-2 border-white/20 text-white text-[16px] px-4 py-3 outline-none placeholder:text-white/30 focus:border-orange transition-colors duration-200 resize-none"
                placeholder="tell peers a bit about yourself"
                value={bio()}
                onInput={(e) => setBio(e.currentTarget.value)}
                maxLength={160}
                rows={3}
              />
              <p class="text-[12px] font-mono text-white/20 mt-1">
                {bio().length}/160
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            fullWidth
            onClick={handleCreate}
            disabled={!displayName().trim() || isCreating()}
          >
            {isCreating() ? "generating keypair..." : "create identity"}
          </Button>

          <p class="text-[12px] font-mono text-white/20 text-center mt-4">
            an ed25519 keypair will be generated and stored locally on your
            device
          </p>
        </div>
      </Show>

      {/* subtle branding at bottom */}
      <div class="fixed bottom-6 left-0 right-0 text-center">
        <p class="text-[11px] font-mono text-white/10 uppercase tracking-[0.1em]">
          dusk protocol v0.1.0
        </p>
      </div>
    </div>
  );
};

export default SignUpScreen;
