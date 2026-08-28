(() => {
  const addTnPresentation = () => {
    document.querySelectorAll('select').forEach(select => {
      const kgOption = [...select.options].find(o => o.textContent.trim() === 'Big Bag 1000 kg');
      if (!kgOption || [...select.options].some(o => o.dataset.tnPresentation === 'true')) return;
      const tnOption = kgOption.cloneNode(true);
      tnOption.textContent = 'Big Bag 1 Tn';
      tnOption.dataset.tnPresentation = 'true';
      select.insertBefore(tnOption, kgOption);
    });
  };
  addTnPresentation();
  new MutationObserver(addTnPresentation).observe(document.documentElement, {subtree: true, childList: true});
})();
