<template>
  <div class="dot-loader">
    <span class="dot" />
    <span class="dot" />
    <span class="dot" />
    <span class="dot" />
  </div>
</template>

<style lang="scss" scoped>
.dot-loader {
  position: relative;
  width: 26px;
  height: 26px;
  animation: rotate 1.2s linear infinite;

  .dot {
    position: absolute;
    width: 8px;
    height: 8px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 50%;
    animation: fade 1.2s linear infinite;

    &:nth-child(1) {
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      animation-delay: 0s;
    }

    &:nth-child(2) {
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      animation-delay: 0.3s;
    }

    &:nth-child(3) {
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      animation-delay: 0.6s;
    }

    &:nth-child(4) {
      top: 50%;
      left: 0;
      transform: translateY(-50%);
      animation-delay: 0.9s;
    }
  }
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes fade {
  0%,
  100% {
    opacity: 0.3;
  }
  25% {
    opacity: 1;
  }
}
</style>
