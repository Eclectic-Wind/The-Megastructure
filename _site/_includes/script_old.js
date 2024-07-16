// Configuration
Vue.config.devtools = true;

// Component Definition
Vue.component('card', {
  template: `
    <!-- Card Template -->
    <div class="card-wrap" @mousemove="handleMouseMove" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave" ref="card">
      <div class="card" :style="cardStyle">
        <div class="card-info">
          <div class="content-container">
            <div class="card-bg" :style="[cardBgTransform, cardBgImage]"></div>
            <div class="content">
              <slot name="content">
                <div class="bio-info"></div>
                <div class="profile-container" :style="[profileContTransform]">
                  <div class="profile" :style="[profileTransform, profileImage]"></div>
                </div>
                <div class="bio" :style="[bioTransform]">
                  <div class="formatting">
                    <h1 xtr-data="ENTP || 5w4 | 584 || sp/sx || ILE ">Kam.</h1>
                    <div class="flex1">
                      <div class="row1">
                        <h4>PRONOUNS</h4>
                        <p>He/him</p>
                      </div>
                      <div class="row2">
                        <h4 :xtr-data="birthDate.toDateString()">AGE</h4>
                        <p :xtr-data="birthDate.toDateString()">{{ age }}</p>
                      </div>
                    </div>
                    <div class="flex2">
                      <div class="row2">
                        <h4>PURSUITS</h4>
                        <p>Art, Philosophy, Writing, Problem Solving</p>
                      </div>
                    </div>
                    <div class="flex3">
                      <div class="row2">
                        <h4>BIO</h4>
                        <p>A freelancing autodidact with a primary interest in philosophy. 
                        An interest in the esoteric and arcane. A burning star amidst blue landscapes -- <i><span data-xtr="C: After all, Anemos, you know who you are.||A: of course.||C: bring to them dreams.">
                        A Wizard That Wandered Through the Halls of the Library.</i></span></p>
                      </div>
                    </div>
                  </div>
                </div>
              </slot>
            </div>
          </div>
          <div class="toggle-container">
            <div class="toggle-mode" @click="toggleMode">
              <i class="fas fa-sun" v-if="!isDarkMode"></i>
              <i class="fas fa-moon" v-if="isDarkMode"></i>
              <i class="fas fa-circle"></i>
            </div>
        </div>
        <div class="menu-container">
            <div class="menu-dots">
                <div class="menu-dot" data-title="Home"></div>
                <div class="menu-dot" data-title="Arts"></div>
                <div class="menu-dot" data-title="Philosophy"></div>
                <div class="menu-dot" data-title="Writing"></div>
                <div class="menu-dot" data-title="More"></div>
            </div>
        </div>
        <div id="xtr-data-display" v-show="isXtrDataVisible" :style="[dataDisplayTransform]">
            <p v-for="(line, index) in formattedXtrData" :key="index">{{ line }}</p>
        </div>
      </div>
      <footer>
            <div class="links">
        <a href="https://discordapp.com/users/178093021131177984">
            <i class="fab fa-discord"></i>
        </a>
        <a href="https://x.com/KamPersonal">
            <i class="fab fa-x-twitter"></i>
        </a>
        <a href="https://open.spotify.com/user/ac52i6lo5y9hvk2c0jv26f9gp?si=1a0ca60e9e5e423b">
            <i class="fab fa-spotify"></i>
        </a>
    </div>
        <p style="text-align: center; bottom: 0; z-index: 6;">&copy; kam. 2024. All rights reserved.</p>
      </footer>
    </div>
  `,

  // Lifecycle Hooks
  mounted() {
    this.width = this.$refs.card.offsetWidth;
    this.height = this.$refs.card.offsetHeight;
    this.isDarkMode = document.documentElement.classList.contains('dark-mode');
    this.$nextTick(() => {
      this.processXtrData();
    });
  },

  // Props
  props: ['dataImage'],

  // Data
  data: () => ({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
    mouseLeaveDelay: null,
    isDarkMode: true,
    birthDate: new Date('2002-11-02T00:00:00+08:00'),
    xtrDataContent: '',
    isXtrDataVisible: false,
  }),

  // Computed Properties
  computed: {
    mousePX() {
      return this.mouseX / this.width;
    },
    mousePY() {
      return this.mouseY / this.height;
    },
    cardStyle() {
      const rX = this.mousePX * 20;
      const rY = this.mousePY * -20;
      return {
        transform: `rotateY(${rX}deg) rotateX(${rY}deg)`
      };
    },
    cardBgTransform() {
      const tX = this.mousePX * -40;
      const tY = this.mousePY * -40;
      return {
        transform: `translateX(${tX}px) translateY(${tY}px)`
      }
    },
    cardBgImage() {
      return {
        backgroundImage: `url(${this.dataImage})`
      }
    },
    profileContTransform() {
      const tX = this.mousePX * 40;
      const tY = this.mousePY * 40;
      return {
        transform: `translateX(${tX}px) translateY(${tY}px)`
      }
    },
    profileTransform() {
      const tX = this.mousePX * 5;
      const tY = this.mousePY * 5;
      return {
        transform: `translateX(${tX}px) translateY(${tY}px)`
      }
    },
    dataDisplayTransform() {
        const tX = this.mousePX * 25;
        const tY = this.mousePY * 25;
        return {
          transform: `translateX(${tX}px) translateY(${tY}px)`
        }
      },
    profileImage() {
      return {
        backgroundImage: `url('_includes/assets/images/anemos_pfp_glitch.gif')`,
        'z-index': 4,
      }
    },
    bioTransform() {
      const tX = this.mousePX * 10;
      const tY = this.mousePY * 10;
      return {
        transform: `translateX(${tX}px) translateY(${tY}px)`
      }
    },
    age() {
      const today = new Date();
      const yearsDiff = today.getFullYear() - this.birthDate.getFullYear();
      const monthsDiff = today.getMonth() - this.birthDate.getMonth();
      const daysDiff = today.getDate() - this.birthDate.getDate();

      if (monthsDiff < 0 || (monthsDiff === 0 && daysDiff < 0)) {
        return yearsDiff - 1;
      } else {
        return yearsDiff;
      }
    },
    formattedXtrData() {
        return this.xtrDataContent.split('||').map(line => line.trim());
      }
  },

  // Methods
  methods: {
    handleMouseMove(e) {
      const rect = this.$refs.card.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left - this.width / 2;
      this.mouseY = e.clientY - rect.top - this.height / 2;
      const multiplier = 0.8;
      this.mouseX *= multiplier;
      this.mouseY *= multiplier;

      // Updated logic to detect and display xtr-data
      const target = e.target.closest('[xtr-data]');
      if (target) {
        const xtrData = target.getAttribute('xtr-data');
        this.xtrDataContent = xtrData;
        this.isXtrDataVisible = true;
      } else {
        this.isXtrDataVisible = false;
      }
    },
    handleMouseEnter() {
      clearTimeout(this.mouseLeaveDelay);
    },
    handleMouseLeave() {
      this.mouseLeaveDelay = setTimeout(() => {
        this.mouseX = 0;
        this.mouseY = 0;
        this.isXtrDataVisible = false;
      }, 1000);
    },
    toggleMode() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('isDarkMode', JSON.stringify(this.isDarkMode));
        this.applyMode();
      },
    applyMode() {
      document.documentElement.classList.toggle('dark-mode', this.isDarkMode);
      document.documentElement.classList.toggle('light-mode', !this.isDarkMode);
    },
    processXtrData() {
      const elements = this.$el.querySelectorAll('[data-xtr]');
      elements.forEach(el => {
        const xtrData = el.getAttribute('data-xtr');
        el.setAttribute('xtr-data', xtrData);
        el.removeAttribute('data-xtr');
      });
    }
  }
});

// App Instance
const app = new Vue({
  el: '#app'
});