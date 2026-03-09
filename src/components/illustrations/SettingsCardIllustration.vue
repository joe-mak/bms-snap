<template>
  <svg
    class="action-card-illustration settings-illustration"
    viewBox="0 0 738 477"
    overflow="visible"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style="right:12px;"
  >
    <g filter="url(#filter0_settings)">
      <!-- Main card bg -->
      <rect class="skel" x="23" y="20" width="691" height="445" rx="24" fill="white" shape-rendering="crispEdges"/>
      <rect x="23.5" y="20.5" width="690" height="444" rx="23.5" stroke="white" shape-rendering="crispEdges"/>

      <!-- Header bar -->
      <g filter="url(#filter1_settings)">
        <path class="skel" d="M24 44C24 30.7452 34.7452 20 48 20H690C703.255 20 714 30.7452 714 44V159H24V44Z" fill="white" shape-rendering="crispEdges"/>
        <circle class="skel skel-circle" cx="54" cy="48" r="12" fill="#D9D9D9"/>
        <circle class="skel skel-circle" cx="86" cy="48" r="12" fill="#D9D9D9"/>
        <circle class="skel skel-circle" cx="118" cy="48" r="12" fill="#D9D9D9"/>
        <circle class="skel skel-accent" cx="74" cy="108" r="32" fill="#EBAA28"/>
        <rect class="skel skel-bar" x="122" y="96" width="145" height="24" rx="12" fill="#D9D9D9"/>
      </g>

      <!-- Avatar -->
      <circle class="skel skel-circle" cx="72" cy="207" r="32" fill="#F4F4F4"/>

      <!-- Name bar -->
      <rect class="skel skel-bar" x="112" y="175" width="75" height="16" rx="8" fill="#D9D9D9"/>

      <!-- Content card -->
      <rect class="skel skel-card" x="112" y="199" width="226" height="112" rx="16" fill="#EFEFEF"/>
      <rect class="skel skel-line" x="124" y="211" width="75" height="11" rx="5.5" fill="#D9D9D9"/>
      <rect class="skel skel-line" x="124" y="230" width="178" height="11" rx="5.5" fill="#D9D9D9"/>
      <rect class="skel skel-line" x="124" y="249" width="118" height="11" rx="5.5" fill="#D9D9D9"/>
      <rect class="skel skel-line" x="124" y="268" width="148" height="11" rx="5.5" fill="#D9D9D9"/>
      <rect class="skel skel-line" x="124" y="287" width="81" height="11" rx="5.5" fill="#D9D9D9"/>

      <!-- Green card -->
      <rect class="skel skel-green" x="463" y="330" width="235" height="119" rx="16" fill="#A1FA85"/>
      <rect class="skel skel-dark-line" x="479" y="346" width="75" height="11" rx="5.5" fill="#636363"/>
      <rect class="skel skel-dark-line" x="479" y="365" width="171" height="11" rx="5.5" fill="#636363"/>
      <rect class="skel skel-dark-line" x="479" y="384" width="118" height="11" rx="5.5" fill="#636363"/>
      <rect class="skel skel-dark-line" x="479" y="403" width="171" height="11" rx="5.5" fill="#636363"/>
      <rect class="skel skel-dark-line" x="479" y="422" width="81" height="11" rx="5.5" fill="#636363"/>
    </g>

    <defs>
      <filter id="filter0_settings" x="23" y="20" width="699" height="457" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feFlood flood-opacity="0" result="BackgroundImageFix"/>
        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
        <feOffset dx="8" dy="12"/>
        <feComposite in2="hardAlpha" operator="out"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0"/>
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1"/>
        <feBlend mode="normal" in="SourceGraphic" in2="effect1" result="shape"/>
      </filter>
      <filter id="filter1_settings" x="0" y="0" width="738" height="187" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feFlood flood-opacity="0" result="BackgroundImageFix"/>
        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
        <feOffset dy="4"/>
        <feGaussianBlur stdDeviation="12"/>
        <feComposite in2="hardAlpha" operator="out"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"/>
        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1"/>
        <feBlend mode="normal" in="SourceGraphic" in2="effect1" result="shape"/>
      </filter>
    </defs>
  </svg>
</template>

<style scoped>
.settings-illustration {
  transform: perspective(300px) rotateX(0deg) rotateY(-24deg) rotateZ(-3deg);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.action-card:hover .settings-illustration {
  transform: perspective(300px) rotateX(0deg) rotateY(-18deg) rotateZ(-2deg) scale(1.35) translateY(-20px);
}

/* Skeleton shimmer */
.skel {
  position: relative;
}

.skel-circle,
.skel-bar,
.skel-line,
.skel-card,
.skel-dark-line,
.skel-green,
.skel-accent {
  opacity: 1;
  transition: opacity 0.3s ease;
}

.action-card:hover .skel-circle,
.action-card:hover .skel-bar,
.action-card:hover .skel-line,
.action-card:hover .skel-card,
.action-card:hover .skel-dark-line,
.action-card:hover .skel-green,
.action-card:hover .skel-accent {
  animation: skeleton-pulse 1.2s ease-in-out infinite;
}

.action-card:hover .skel-bar {
  animation-delay: 0.1s;
}

.action-card:hover .skel-line:nth-child(2n) {
  animation-delay: 0.15s;
}

.action-card:hover .skel-line:nth-child(3n) {
  animation-delay: 0.25s;
}

.action-card:hover .skel-card {
  animation-delay: 0.05s;
}

.action-card:hover .skel-green {
  animation-delay: 0.2s;
}

.action-card:hover .skel-dark-line {
  animation-delay: 0.3s;
}

.action-card:hover .skel-accent {
  animation-delay: 0s;
}

@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
