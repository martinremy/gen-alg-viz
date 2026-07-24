// Wires the DOM sliders/buttons to app state. Calls onChange(kind) when a
// value changes so main.js can react: "objective" => re-evaluate the current
// population; "evolution" => param-only change; "action" => play/pause/step/reset.

const DEG = Math.PI / 180;

export function setupControls(state, onChange) {
  const $ = (id) => document.getElementById(id);

  const readObjective = () => {
    state.cruiseAlpha = (+$("slAlpha").value) * DEG;
    state.wLift = +$("slLift").value;
    state.wDrag = +$("slDrag").value;
    state.stallTarget = (+$("slStall").value) * DEG;
  };
  const readEvolution = () => {
    state.mutationRate = +$("slMutation").value;
    state.speed = +$("slSpeed").value;
  };

  readObjective();
  readEvolution();
  state.playing = true;
  state.showSkeleton = false;

  for (const id of ["slAlpha", "slLift", "slDrag", "slStall"]) {
    $(id).addEventListener("input", () => {
      readObjective();
      onChange("objective");
    });
  }
  for (const id of ["slMutation", "slSpeed"]) {
    $(id).addEventListener("input", () => {
      readEvolution();
      onChange("evolution");
    });
  }

  $("btnPlayPause").addEventListener("click", () => {
    state.playing = !state.playing;
    $("btnPlayPause").textContent = state.playing ? "Pause" : "Play";
    onChange("action");
  });
  $("btnStep").addEventListener("click", () => {
    state.stepOnce = true;
    onChange("action");
  });
  $("btnReset").addEventListener("click", () => {
    onChange("reset");
  });
  $("chkSkeleton").addEventListener("change", () => {
    state.showSkeleton = $("chkSkeleton").checked;
    onChange("evolution");
  });

  return state;
}