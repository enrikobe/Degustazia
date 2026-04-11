// legacy_noop.js — P2b

        saveState();
        renderGrid();
        updateDetail();
      });
    });
  } else if(evoPick) {
    evoPick.innerHTML = evoDotsHTML(ev.evolution, 'big');
  }

    }

function renderSortButtons(){
      const wrap = document.getElementById("sortBtnsWrap");
      if(!wrap) return;
